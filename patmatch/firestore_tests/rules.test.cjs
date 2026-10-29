const {before, after, beforeEach, test} = require('node:test');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {assertFails, assertSucceeds, initializeTestEnvironment} = require('@firebase/rules-unit-testing');

let env;
const chatId = 'chat_story_test';
const message = (senderId = 1) => ({
  text: 'Hello', senderId, senderUid: String(senderId), senderName: 'Test',
  type: 'text', timestamp: new Date(), readBy: [senderId],
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-petow-story-replies',
    firestore: {
      rules: readFileSync(path.join(__dirname, '..', 'firestore.story-replies.v2.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seed(status = 'approved', active = true) {
  await env.withSecurityRulesDisabled(async ctx => {
    await ctx.firestore().collection('chats').doc(chatId).set({
      participants: [1, 2], participantUids: ['1', '2'],
      permissionStatus: status, isActive: active,
    });
  });
}

test('only authenticated room members can read or write approved chats', async () => {
  await seed();
  const member = env.authenticatedContext('1').firestore();
  const outsider = env.authenticatedContext('3').firestore();
  const guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(member.collection('chats').doc(chatId).get());
  await assertSucceeds(member.collection('chats').doc(chatId).collection('messages').doc('m1').set(message()));
  await assertFails(outsider.collection('chats').doc(chatId).get());
  await assertFails(outsider.collection('chats').doc(chatId).collection('messages').doc('m2').set(message(3)));
  await assertFails(guest.collection('chats').doc(chatId).get());
});

test('pending, rejected, archived, and blocked rooms deny message writes', async () => {
  const member = env.authenticatedContext('1').firestore();
  for (const [status, active] of [['pending', false], ['rejected', false], ['approved', false], ['disabled', false]]) {
    await seed(status, active);
    await assertFails(member.collection('chats').doc(chatId).collection('messages').doc(`m-${status}-${active}`).set(message()));
  }
});

test('clients cannot change room permissions or forge a story reference', async () => {
  await seed();
  const member = env.authenticatedContext('1').firestore();
  await assertFails(member.collection('chats').doc(chatId).update({permissionStatus: 'disabled'}));
  await assertFails(member.collection('chats').doc(chatId).collection('messages').doc('forged').set({...message(), storyId: 5}));
  await assertFails(member.collection('chats').doc(chatId).collection('messages').doc('spoof').set(message(2)));
});
