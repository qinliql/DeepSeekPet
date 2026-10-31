/** Integration of local simulation, durable pending memory, model validation and silence policy. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCompanion } from './service.ts';
test('offline state survives restart, feeding is local and affection does not decay', () => {
  const root = mkdtempSync(join(tmpdir(), 'whale-'));
  let time = new Date(2026, 9, 31, 8).getTime();
  try {
    const a = createCompanion(root, () => time);
    a.read();
    a.dispose();
    time += 12 * 3600000;
    const b = createCompanion(root, () => time);
    const v = b.read().pets.main.vitals;
    assert.equal(v.satiety, 32);
    assert.equal(v.affection, 50);
    assert.equal(v.miss, 24);
    b.feed();
    assert.equal(b.read().pets.main.vitals.satiety, 52);
    b.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('six rounds extract once and inject validated facts after restart; raw memory persists on failure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'whale-'));
  let calls = 0;
  const generate = async () => {
    calls++;
    return JSON.stringify({ facts: [{ text: '主人下周三面试', keywords: ['面试'], importance: 3 }] });
  };
  try {
    const a = createCompanion(root);
    for (let i = 0; i < 6; i++) a.record('main', '下周三面试', '记住啦', generate);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(a.read().pets.main.pending.length, 0);
    a.dispose();
    const b = createCompanion(root);
    assert.match(b.prompt('main', '面试'), /下周三面试/);
    for (let i = 0; i < 6; i++) b.record('main', '新消息', '好的', async () => '{broken');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(b.read().pets.main.pending.length, 12);
    b.dispose();
    writeFileSync(join(root, 'companion.json'), '{');
    const c = createCompanion(root);
    assert.equal(c.read().pets.main.pending.length, 12);
    c.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('disabled memory never extracts and silent ticking never calls a model', () => {
  const root = mkdtempSync(join(tmpdir(), 'whale-'));
  let time = Date.now(),
    calls = 0;
  try {
    const a = createCompanion(root, () => time);
    a.settings(true, false);
    for (let i = 0; i < 10; i++)
      a.record('main', 'hi', 'hello', async () => {
        calls++;
        return '{}';
      });
    time += 86400000;
    a.tick();
    assert.equal(calls, 0);
    assert.equal(a.read().pets.main.pending.length, 0);
    assert.equal(a.prompt('main', 'hi').includes('历史记录'), false);
    assert.match(a.proactive('main') ?? '', /想念/);
    assert.equal(a.proactive('main'), undefined);
    a.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
