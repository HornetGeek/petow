const test = require('node:test');
const assert = require('node:assert/strict');
const {nextSummary} = require('./summary');
const ts = value => ({toMillis: () => value});

test('first new message preserves an existing room count', () => {
  const next = nextSummary({}, 91, {timestamp: ts(10), text: 'hello'}, 'm1');
  assert.equal(next.count, 91);
  assert.equal(next.version, 1);
});

test('older events do not replace the newest preview or reduce the count', () => {
  const current = {count: 91, version: 3, lastMessageAt: ts(20), lastMessageId: 'm2', lastMessagePreview: 'new'};
  const next = nextSummary(current, 90, {timestamp: ts(10), text: 'old'}, 'm1');
  assert.equal(next.count, 91);
  assert.equal(next.lastMessagePreview, undefined);
});

test('document ID breaks timestamp ties', () => {
  const current = {lastMessageAt: ts(10), lastMessageId: 'm1'};
  assert.equal(nextSummary(current, 2, {timestamp: ts(10), text: 'new'}, 'm2').lastMessagePreview, 'new');
});
