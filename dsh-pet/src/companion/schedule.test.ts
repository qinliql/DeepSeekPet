import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours } from './schedule.ts';
const at = (hour: number, minute = 0) => new Date(2026, 9, 31, hour, minute).getTime();
test('custom rest respects 02–08 boundaries, overnight hours and all-day mode', () => {
  assert.equal(inQuietHours(at(1, 59), 120, 480), false);
  assert.equal(inQuietHours(at(2), 120, 480), true);
  assert.equal(inQuietHours(at(7, 59), 120, 480), true);
  assert.equal(inQuietHours(at(8), 120, 480), false);
  assert.equal(inQuietHours(at(23), 1320, 480), true);
  assert.equal(inQuietHours(at(1), 1320, 480), true);
  assert.equal(inQuietHours(at(12), 1320, 480), false);
  assert.equal(inQuietHours(at(12), 120, 120), true);
});
