/** Long professional replies remain in the archive while the next model context stays bounded. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitHistory } from './history-budget.ts';
test('history retains recent user-starting turns without mutating original messages', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 ? ('assistant' as const) : ('user' as const),
    content: String(i) + 'x'.repeat(i % 2 ? 10000 : 1500),
    ts: i,
  }));
  const fitted = fitHistory(messages);
  assert.ok(fitted.reduce((n, m) => n + m.content.length, 0) <= 14000);
  assert.equal(fitted[0].role, 'user');
  assert.equal(fitted[fitted.length - 1].ts, 19);
  assert.equal(messages[19].content.length, 10002);
});
