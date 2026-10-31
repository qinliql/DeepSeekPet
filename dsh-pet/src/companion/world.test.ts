/** World events are durable before sharing, suggestions have consequences and restore isolates journals. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorld } from './world.ts';
const root = () => mkdtempSync(join(tmpdir(), 'fish-world-'));
test('ordinary life is saved without model calls or shares; fictional scenes persist with provenance', async () => {
  const dir = root();
  let time = new Date(2026, 9, 31, 10).getTime(),
    calls = 0;
  const generate = async (_system: string, text: string) => {
    calls++;
    const c = JSON.parse(text);
    return JSON.stringify({
      hasEvent: true,
      title: '留下第一幅画',
      body: '鱼团留下了自己画歪的杯子，Claude也展示了自己的草稿。',
      storyId: c.story.id,
      state: '第一幅画已经留下，接下来考虑摆放的位置。',
      participants: ['claude'],
      location: 'room',
      share: '爸爸，我没把那张歪杯子扔掉。',
      item: '歪杯子画',
      skill: '画画',
      relationships: [{ id: 'claude', note: '开始愿意互相展示未完成的作品' }],
      suggestions: c.suggestions.map((s: { id: string }) => ({
        id: s.id,
        status: 'adopted',
        reason: '先保留作品，以后可以比较。',
      })),
    });
  };
  try {
    const w = createWorld(
      dir,
      generate,
      () => true,
      () => time,
    );
    time += 2 * 3600000;
    w.tick();
    assert.equal(calls, 0);
    assert.equal(w.read().events.length, 1);
    w.suggest('window-corner', '画歪了也先留着');
    await w.advance(true);
    assert.equal(calls, 1);
    assert.equal(w.read().suggestions[0].status, 'adopted');
    assert.equal(w.read().skills['画画'], 1);
    assert.match(w.read().relationships.claude, /作品/);
    assert.ok(w.read().inventory.includes('歪杯子画'));
    assert.match(readFileSync(join(dir, '鱼团生活日记.md'), 'utf8'), /留下第一幅画/);
    const sent: string[] = [];
    w.setPublisher(async (text) => {
      sent.push(text);
    });
    time += 21 * 60000;
    await w.share();
    await w.share();
    assert.equal(sent.length, 1);
    w.place('歪杯子画', '窗边');
    w.dispose();
    const restored = createWorld(
      dir,
      generate,
      () => true,
      () => time,
    );
    assert.equal(restored.read().room['歪杯子画'], '窗边');
    assert.equal(restored.read().skills['画画'], 1);
    assert.ok(restored.prompt('画画').includes('留下第一幅画'));
    restored.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('restoring an older world never resurrects newer events from a previous journal', () => {
  const dir = root();
  try {
    const w = createWorld(
      dir,
      async () => '',
      () => false,
    );
    const old = w.read();
    w.observe('编辑器', '这是一条现实观察');
    assert.equal(w.read().events.length, 1);
    w.restore(old);
    w.dispose();
    const next = createWorld(
      dir,
      async () => '',
      () => false,
    );
    assert.equal(next.read().events.length, 0);
    assert.ok(existsSync(join(dir, 'world-events.jsonl')));
    next.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('unknown participants and duplicate scene bodies are rejected; empty outcomes are valid', async () => {
  const dir = root();
  let value = JSON.stringify({ hasEvent: false });
  try {
    const w = createWorld(
      dir,
      async () => value,
      () => true,
    );
    await w.advance(true);
    assert.equal(w.read().lastError, '');
    assert.equal(w.read().events.length, 0);
    value = JSON.stringify({
      hasEvent: true,
      title: 'bad',
      body: 'bad',
      storyId: 'window-corner',
      participants: ['outside-model'],
      location: 'room',
    });
    await w.advance(true);
    assert.equal(w.read().events.length, 0);
    assert.ok(w.read().lastError);
    w.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('damaged journal tails are backed up and valid observations survive recovery', () => {
  const dir = root();
  try {
    const w = createWorld(
      dir,
      async () => '',
      () => false,
    );
    w.observe('窗口', '能确认的文字');
    w.dispose();
    writeFileSync(join(dir, 'world-events.jsonl'), readFileSync(join(dir, 'world-events.jsonl'), 'utf8') + '{broken');
    const next = createWorld(
      dir,
      async () => '',
      () => false,
    );
    assert.equal(next.read().events.length, 1);
    assert.match(next.diary(), /现实屏幕观察/);
    next.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pausing a story during generation prevents a late result from overwriting it', async () => {
  const dir = root();
  let finish: (value: string) => void = () => {};
  try {
    const w = createWorld(
      dir,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      () => true,
    );
    const request = w.advance(true);
    const story = w.read().stories[0];
    w.story({ ...story, status: 'paused' });
    finish(
      JSON.stringify({
        hasEvent: true,
        title: '迟到的结果',
        body: '不应写入',
        storyId: story.id,
        state: '不应覆盖暂停',
        participants: ['gpt'],
        location: 'room',
      }),
    );
    await request;
    assert.equal(w.read().stories[0].status, 'paused');
    assert.equal(w.read().events.length, 0);
    w.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('older meaningful observations can be recalled beyond the recent-event window', () => {
  const dir = root();
  try {
    const w = createWorld(
      dir,
      async () => '',
      () => false,
    );
    w.observe('Redis 面试准备', '爸爸正在准备Redis面试，这是较早的一次观察。');
    for (let i = 0; i < 15; i++) w.observe('其他窗口' + i, '后来的一条普通记录' + i);
    assert.match(w.prompt('以前的Redis面试'), /较早的一次观察/);
    w.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy settings migrate to 02–08 and more than four companions remain editable', () => {
  const dir = root();
  let time = new Date(2026, 9, 31, 1).getTime();
  try {
    const world = createWorld(
      dir,
      async () => '',
      () => false,
      () => time,
    );
    assert.equal(world.isQuiet(), false);
    assert.equal(world.read().settings.quietStart, 120);
    time = new Date(2026, 9, 31, 2).getTime();
    assert.equal(world.isQuiet(), true);
    const initial = world.read().cards[0];
    world.update({
      cards: Array.from({ length: 12 }, (_, i) => ({ ...initial, id: 'extra-' + i, name: '同伴' + i })),
      settings: {
        quietStart: 1320,
        quietEnd: 480,
        sceneCompanions: 6,
        maxActiveStories: 6,
        contextCharacters: 12,
        idleMinutes: 10,
        shareCooldownMinutes: 15,
      },
    });
    assert.equal(world.read().cards.length, 12);
    assert.equal(world.read().settings.sceneCompanions, 6);
    assert.equal(world.read().settings.maxActiveStories, 6);
    time = new Date(2026, 9, 31, 23).getTime();
    assert.equal(world.isQuiet(), true);
    world.update({ settings: { quietAtNight: false } });
    assert.equal(world.isQuiet(), false);
    world.dispose();
    const again = createWorld(
      dir,
      async () => '',
      () => false,
      () => time,
    );
    assert.equal(again.read().cards.length, 12);
    assert.equal(again.read().settings.quietStart, 1320);
    again.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
