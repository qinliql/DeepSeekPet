/** Offline simulation regressions, including cross-midnight and clock rollback. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialVitals, settle } from './vitals.ts';
test('12 hours cost 48 satiety and never reduce affection', () => {
  const now = new Date(2026, 9, 31, 8).getTime();
  const v = initialVitals(now);
  const result = settle(v, now + 12 * 3600000);
  assert.equal(result.satiety, 32);
  assert.equal(result.affection, v.affection);
  assert.equal(result.miss, 24);
  assert.deepEqual(settle(result, result.lastTickAt), result);
});
test('cross-night energy is integrated rather than using only final hour', () => {
  const now = new Date(2026, 9, 31, 21).getTime();
  const v = { ...initialVitals(now), energy: 20 };
  assert.equal(settle(v, now + 3 * 3600000).energy, 34);
});
test('rollback cannot double-charge time when the clock catches up', () => {
  const v = initialVitals(100000);
  assert.deepEqual(settle(v, 0), v);
});
