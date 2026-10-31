/** Customization survives restart and rejects values outside user controls. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppearance } from './appearance.ts';
test('fish identity and readable quiet defaults persist with partial updates', () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-style-'));
  try {
    const a = createAppearance(root);
    assert.equal(a.read().name, '鱼团');
    assert.equal(a.read().sizePercent, 100);
    assert.throws(() => a.save({ sizePercent: 49 }));
    assert.equal(a.read().quiet, true);
    assert.equal(a.read().fontSize, 18);
    a.save({ fontSize: 22, accent: '#123456', idleMinutes: 12 });
    const b = createAppearance(root);
    assert.equal(b.read().fontSize, 22);
    assert.equal(b.read().name, '鱼团');
    assert.throws(() => b.save({ fontSize: 8 }));
    assert.throws(() => b.save({ name: '' }));
    assert.throws(() => b.save({ unexpected: true }));
    assert.equal(b.read().fontSize, 22);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
