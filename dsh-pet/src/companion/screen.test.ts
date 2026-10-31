/** Screen decisions are local, deduplicated and never store raw screenshots. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createScreenObserver, screenCandidate } from './screen.ts';
import { createWorld } from './world.ts';
test('title stability, idle, exclusions and limits gate every upload', () => {
  const s = {
    enabled: true,
    dailyLimit: 3,
    cooldownMinutes: 45,
    stableSeconds: 120,
    excluded: ['密码'],
    pausedUntil: 0,
  };
  const t = 1000000000;
  const sample = { title: '项目说明 - 编辑器', idleSeconds: 0, locked: false };
  assert.equal(screenCandidate(sample, s, t, 0, 0, t - 120000), true);
  assert.equal(screenCandidate({ ...sample, locked: true }, s, t, 0, 0, t - 120000), false);
  assert.equal(screenCandidate({ ...sample, idleSeconds: 4000 }, s, t, 0, 0, t - 120000), false);
  assert.equal(screenCandidate({ ...sample, title: '密码管理器' }, s, t, 0, 0, t - 120000), false);
  assert.equal(screenCandidate(sample, s, t, 0, 3, t - 120000), false);
});
test('unchanged local image hashes skip a second model call; only validated descriptions are retained', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-screen-'));
  let time = 1000000000,
    calls = 0,
    title = '新项目 - 编辑器';
  const world = createWorld(
    dir,
    async () => '',
    () => false,
    () => time,
  );
  try {
    const observer = createScreenObserver(
      dir,
      async () => {
        calls++;
        return JSON.stringify({
          facts: '屏幕显示一份项目说明。',
          uncertainty: '不能确认是否已完成。',
          worthSharing: false,
          share: '',
        });
      },
      world,
      () => true,
      {
        now: () => time,
        sample: async () => ({ title, idleSeconds: 0, locked: false }),
        capture: async () => ({ data: 'data:image/jpeg;base64,PRIVATE', hash: '1'.repeat(64) }),
      },
    );
    await observer.poll();
    assert.equal(calls, 0);
    time += 120000;
    await observer.poll();
    assert.equal(calls, 1);
    assert.equal(world.read().events[0].source, 'observation');
    assert.equal(readFileSync(join(dir, 'screen.json'), 'utf8').includes('PRIVATE'), false);
    time += 46 * 60000;
    title = '另一个项目 - 编辑器';
    await observer.poll();
    time += 120000;
    await observer.poll();
    assert.equal(calls, 1);
    observer.dispose();
    world.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
