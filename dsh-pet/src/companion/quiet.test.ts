/** Quiet idle uses elapsed silence rather than choosing a new action after each clip. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('breathing stays stable; variations wait eight minutes and interactions restart the wait', () => {
  let time = 1000000000;
  class Sprite {}
  runInNewContext(readFileSync(new URL('../../runtime/electron-helper/sprite/playback.js', import.meta.url), 'utf8'), {
    PetSprite: Sprite,
    Date: { now: () => time },
    window: { petBridge: { openChat() {} } },
    BASE: 'test',
    S: { pick: (v: string[]) => v[0] },
    fetch: () => Promise.resolve({ ok: false }),
  });
  const played: string[] = [];
  const pet = Object.assign(new Sprite(), {
    animations: { idle: ['待机呼吸休闲'] },
    weights: {},
    quietAppearance: { quiet: true, idleMinutes: 8 },
    appearanceFetchedAt: time,
    lastQuietVariationAt: time,
    stopMove() {},
    playOnce(name: string) {
      played.push(name);
    },
  }) as unknown as Sprite & { playIdle(): void; lastCompanionInteractionAt?: number };
  pet.playIdle();
  time += 60000;
  pet.playIdle();
  assert.deepEqual(played, ['待机呼吸休闲', '待机呼吸休闲']);
  time += 7 * 60000;
  pet.playIdle();
  assert.equal(played[played.length - 1], '哈欠连天');
  pet.lastCompanionInteractionAt = time + 7 * 60000;
  time += 8 * 60000;
  pet.playIdle();
  assert.equal(played[played.length - 1], '待机呼吸休闲');
});
