const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const {nextSummary} = require('./summary');
admin.initializeApp();

const syncSecret = defineSecret('CHAT_ADMIN_SYNC_SECRET');
const syncUrl = defineSecret('CHAT_ADMIN_SYNC_URL');

exports.onChatMessageCreated = onDocumentCreated({
  document: 'chats/{chatId}/messages/{messageId}',
  secrets: [syncSecret, syncUrl],
  retry: true,
}, async event => {
  const {chatId, messageId} = event.params;
  const db = admin.firestore();
  const chatRef = db.collection('chats').doc(chatId);
  const summaryRef = chatRef.collection('admin_private').doc('summary');
  const eventRef = summaryRef.collection('processed').doc(messageId);
  const message = event.data.data() || {};
  const timestamp = message.timestamp;
  // Aggregation reads indexed metadata, never the full message history. It also
  // seeds existing rooms correctly when their first post-deploy message arrives.
  const aggregate = await chatRef.collection('messages').count().get();
  const actualCount = aggregate.data().count;
  await db.runTransaction(async transaction => {
    const [seen, current] = await Promise.all([transaction.get(eventRef), transaction.get(summaryRef)]);
    if (seen.exists) return;
    const summary = current.data() || {};
    const next = nextSummary(summary, actualCount, message, messageId);
    transaction.set(summaryRef, next, {merge: true});
    transaction.create(eventRef, {createdAt: admin.firestore.FieldValue.serverTimestamp()});
  });
  const summary = (await summaryRef.get()).data();
  const body = Buffer.from(JSON.stringify({chat_id: chatId, version: summary.version,
    count: summary.count, last_message_at: summary.lastMessageAt?.toDate().toISOString() || null,
    last_message_preview: summary.lastMessagePreview || ''}));
  const stamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', syncSecret.value()).update(stamp + '.').update(body).digest('hex');
  const response = await fetch(syncUrl.value(), {method: 'POST', headers: {'content-type': 'application/json',
    'X-Chat-Timestamp': stamp, 'X-Chat-Signature': signature}, body});
  if (!response.ok) throw new Error(`Django sync failed: ${response.status}`);
});
