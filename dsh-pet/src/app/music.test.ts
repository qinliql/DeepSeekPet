import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMusic } from '../companion/music.ts';
import { startRouter } from './router.ts';
import { createRequestSecurity } from '../standalone/request-security.ts';
test('local music library persists without exposing paths; authenticated byte ranges support seeking', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-music-'));
  const first = join(root, 'first.wav'),
    second = join(root, 'second.mp3');
  writeFileSync(first, Buffer.from(Array.from({ length: 100 }, (_, i) => i)));
  writeFileSync(second, 'local audio');
  const music = createMusic(root),
    security = createRequestSecurity();
  const result = music.add([first, second, first, join(root, 'missing.wav')]);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 2);
  assert.equal(JSON.stringify(music.read()).includes(root), false);
  const id = music.read().tracks[0].id;
  const server = await startRouter([], { security, music, log() {}, status: () => ({}), landingPage: () => '' });
  const base = 'http://127.0.0.1:' + server.port;
  const headers = { 'X-DSH-Pet-Token': security.token };
  try {
    assert.equal((await fetch(base + '/music/state')).status, 403);
    assert.equal((await fetch(base + '/music/audio/' + id)).status, 403);
    const range = await fetch(base + '/music/audio/' + id, { headers: { ...headers, Range: 'bytes=4-7' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 4-7/100');
    assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [4, 5, 6, 7]);
    const suffix = await fetch(base + '/music/audio/' + id, { headers: { ...headers, Range: 'bytes=-3' } });
    assert.deepEqual([...new Uint8Array(await suffix.arrayBuffer())], [97, 98, 99]);
    assert.equal(
      (await fetch(base + '/music/audio/' + id, { headers: { ...headers, Range: 'bytes=999-' } })).status,
      416,
    );
    assert.equal(
      (await fetch(base + '/music/audio/' + id, { headers: { ...headers, Range: 'bytes=-0' } })).status,
      416,
    );
    const head = await fetch(base + '/music/audio/' + id, { method: 'HEAD', headers });
    assert.equal(head.headers.get('content-length'), '100');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(base + '/music/audio/unknown', { headers })).status, 404);
    const settings = await fetch(base + '/music/control', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settings', mode: 'random', volume: 0.4, position: 12 }),
    });
    assert.equal(settings.status, 200);
    const restored = createMusic(root).read();
    assert.equal(restored.mode, 'random');
    assert.equal(restored.volume, 0.4);
    assert.equal(restored.position, 12);
    music.control({ action: 'select', id: music.read().tracks[1].id });
    music.control({ action: 'settings', id, position: 99 });
    assert.equal(music.read().position, 0);
    music.control({ action: 'remove', id });
    assert.equal(existsSync(first), true);
    music.control({ action: 'clear' });
    assert.equal(music.read().tracks.length, 0);
    assert.equal(existsSync(second), true);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
