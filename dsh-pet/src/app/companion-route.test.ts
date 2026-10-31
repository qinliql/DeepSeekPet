/** Companion HTTP integration uses the same access control and persistent service as the app. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCompanion } from '../companion/service.ts';
import { createRequestSecurity } from '../standalone/request-security.ts';
import { startRouter } from './router.ts';
test('state, feeding and switches require authentication and persist correctly', async () => {
  const root = mkdtempSync(join(tmpdir(), 'whale-http-'));
  const companion = createCompanion(root, () => 1234567890000);
  const security = createRequestSecurity();
  const server = await startRouter([], { security, companion, log() {}, status: () => ({}), landingPage: () => '' });
  const url = 'http://127.0.0.1:' + server.port + '/companion';
  const headers = { 'X-DSH-Pet-Token': security.token, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(url)).status, 403);
    const initial = await (await fetch(url, { headers })).json();
    assert.equal(initial.pets.main.vitals.satiety, 80);
    const fed = await (await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'feed' }) })).json();
    assert.ok(fed.pets.main.vitals.satiety > 99);
    const saved = await (
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'settings', enabled: false, memoryEnabled: false }),
      })
    ).json();
    assert.equal(saved.enabled, false);
    assert.equal(saved.memoryEnabled, false);
    assert.equal(
      (await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'settings', enabled: 'yes' }) }))
        .status,
      400,
    );
  } finally {
    await server.close();
    companion.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
