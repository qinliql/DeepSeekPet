import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressReply } from './address.ts';
test('current address replaces obsolete direct addresses without rewriting narrative relatives', () => {
  assert.equal(addressReply('爸爸，我在这里。主人，不要戳我啦。', '主人'), '主人，我在这里。主人，不要戳我啦。');
  assert.equal(addressReply('我爸爸喜欢散步，Claude的爸爸也喜欢。', '主人'), '我爸爸喜欢散步，Claude的爸爸也喜欢。');
  assert.equal(addressReply('主人，看看这个！', '朋友'), '朋友，看看这个！');
});
