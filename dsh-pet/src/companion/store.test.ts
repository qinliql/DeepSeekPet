/** Recovery must preserve data and fail closed when every copy is damaged. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecoverableStore } from './store.ts';
const valid = (v: unknown): v is { value: number } =>
  !!v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number';
test('a damaged live file recovers from snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-'));
  try {
    const store = new RecoverableStore(dir, 'facts', valid);
    store.write({ value: 42 });
    writeFileSync(join(dir, 'facts.json'), '{');
    assert.deepEqual(
      store.read(() => ({ value: 0 })),
      { value: 42 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('without recovery evidence, damaged data never silently resets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-'));
  try {
    writeFileSync(join(dir, 'facts.json'), '{');
    const store = new RecoverableStore(dir, 'facts', valid);
    assert.throws(() => store.read(() => ({ value: 0 })), /damaged/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
