/** Mode selection regressions for technical questions and long personal messages. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMode, dialoguePrompt } from './mode.ts';
test('short technical questions enable professional mode', () => {
  assert.equal(detectMode('Redis 缓存穿透怎么解'), 'professional');
  assert.equal(detectMode('```sql select 1```'), 'professional');
});
test('personal messages remain casual regardless of length', () => {
  assert.equal(detectMode('今天心情不好，我想和你说说话，最近发生了很多事情，想要你陪着我。'), 'casual');
  assert.equal(detectMode('Redis是什么，简短回答'), 'casual');
});
test('mode policy preserves the configured persona', () => {
  assert.ok(dialoguePrompt('小鲸鱼', 'Redis').startsWith('小鲸鱼\n'));
  assert.match(dialoguePrompt('小鲸鱼', 'Redis'), /解除闲聊长度限制/);
});
