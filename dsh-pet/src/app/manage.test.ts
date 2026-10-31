/** Real HTTP CRUD and backup/restore exercise the production service graph without external API calls. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorld } from '../companion/world.ts';
import { createBudget } from '../companion/budget.ts';
import { createMedia } from '../companion/media.ts';
import { createScreenObserver } from '../companion/screen.ts';
import { createCompanion } from '../companion/service.ts';
import { createAppearance } from '../companion/appearance.ts';
import { createConversationStore } from '../companion/conversation-store.ts';
import { createRequestSecurity } from '../standalone/request-security.ts';
import { startRouter } from './router.ts';
test('editing profiles/cards/worldbooks, avatar backup and restore preserve ledger and require capability', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-manage-'));
  const world = createWorld(
      root,
      async () => '',
      () => false,
    ),
    budget = createBudget(root),
    media = createMedia(root),
    companion = createCompanion(root),
    appearance = createAppearance(root),
    conversationStore = createConversationStore(root);
  const observer = createScreenObserver(
    root,
    async () => '',
    world,
    () => false,
  );
  const security = createRequestSecurity();
  const server = await startRouter([], {
    world,
    budget,
    media,
    companion,
    appearance,
    conversationStore,
    observer,
    security,
    log() {},
    status: () => ({}),
    landingPage: () => '',
  });
  const base = 'http://127.0.0.1:' + server.port;
  const headers = { 'X-DSH-Pet-Token': security.token, 'Content-Type': 'application/json' };
  const post = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(base + '/manage/state')).status, 403);
    conversationStore.write({
      main: {
        main: {
          messages: Array.from({ length: 600 }, (_, i) => ({
            role: i % 2 ? ('assistant' as const) : ('user' as const),
            content: '历史消息' + i,
            ts: 100000 + Math.floor(i / 2),
          })),
        },
      },
    });
    const latest = await (await fetch(base + '/manage/history?limit=20', { headers })).json();
    assert.equal(latest.messages.length, 20);
    assert.equal(latest.hasMore, true);
    const previous = await (
      await fetch(base + '/manage/history?limit=20&before=' + latest.earliestTs, { headers })
    ).json();
    assert.equal(previous.messages.length, 20);
    assert.ok(previous.messages[previous.messages.length - 1].ts < latest.earliestTs);

    assert.equal(
      (await post('/manage/world', { user: { address: '爸爸', background: '喜欢安静地聊天' } })).status,
      200,
    );
    assert.equal(
      (
        await post('/manage/import-card', {
          kind: 'character',
          data: {
            data: { name: '小雨', description: '鱼团的新同学', personality: '好奇', mes_example: '今天想试试画云。' },
          },
        })
      ).status,
      200,
    );
    assert.equal(world.read().cards.find((c) => c.name === '小雨')?.personality, '好奇');
    assert.equal(
      (
        await post('/manage/import-card', {
          kind: 'worldbook',
          data: { entries: [{ comment: '小书店', content: '一家安静的书店', keys: ['读书'] }] },
        })
      ).status,
      200,
    );
    assert.ok(world.read().books.some((b) => b.name === '小书店'));
    assert.equal(
      (await post('/manage/memory', { action: 'save', text: '爸爸喜欢喝茶', keywords: ['茶'], importance: 2 })).status,
      200,
    );
    const memory = companion.read().pets.main.facts[0];
    assert.equal((await post('/manage/memory', { action: 'save', id: memory.id, text: '爸爸喜欢绿茶' })).status, 200);
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ZkAAAAASUVORK5CYII=';
    assert.equal((await post('/manage/avatar', { target: 'user', data: png })).status, 200);
    assert.equal((await fetch(base + '/user-avatar.jpg')).status, 200);
    const response = await fetch(base + '/manage/backup', { headers });
    const backup = await response.json();
    assert.equal(backup.format, 'fish-world-v1');
    assert.equal(JSON.stringify(backup).includes('apiKey'), false);
    await post('/manage/world', { user: { address: '主人' } });
    assert.equal(appearance.read().owner, '主人');
    const changedAddress = await post('/dsh-pet-7340/appearance', { owner: '搭档' });
    assert.equal(changedAddress.status, 200);
    assert.equal(world.read().user.address, '搭档');
    const initial = backup.world.user.address;
    await post('/manage/world', { user: { address: '家长' } });
    assert.equal(world.read().user.address, '家长');
    const ledger = budget.read().spent;
    assert.equal((await post('/manage/restore', backup)).status, 200);
    assert.equal(world.read().user.address, initial);
    assert.equal(budget.read().spent, ledger);
    assert.ok(media.read().user);
    const damaged = structuredClone(backup);
    damaged.files = {};
    assert.equal((await post('/manage/restore', damaged)).status, 400);
    assert.equal(world.read().user.address, initial);
    assert.equal((await post('/manage/memory', { action: 'delete', id: memory.id })).status, 200);
    assert.equal(companion.read().pets.main.facts.length, 0);
    assert.equal((await post('/manage/budget', { limit: 25 })).status, 400);
  } finally {
    await server.close();
    observer.dispose();
    world.dispose();
    companion.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
