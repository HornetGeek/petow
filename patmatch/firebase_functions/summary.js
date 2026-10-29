function nextSummary(summary, actualCount, message, messageId) {
  const timestamp = message.timestamp;
  const newest = !summary.lastMessageAt || (timestamp && (timestamp.toMillis() > summary.lastMessageAt.toMillis() ||
    (timestamp.toMillis() === summary.lastMessageAt.toMillis() && messageId > (summary.lastMessageId || ''))));
  const next = {count: Math.max(summary.count || 0, actualCount), version: (summary.version || 0) + 1};
  if (newest) Object.assign(next, {lastMessageAt: timestamp, lastMessageId: messageId,
    lastMessagePreview: message.type === 'image' ? '📷' : String(message.text || '').slice(0, 120)});
  return next;
}
module.exports = {nextSummary};
