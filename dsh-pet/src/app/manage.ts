import type { Reality } from '../companion/reality.ts';
/** Authenticated local editing and backup APIs. API credentials never enter exports. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PACKAGE_ROOT } from '../host/paths.ts';
import type { World } from '../companion/world.ts';
import { bookSchema, worldSchema } from '../companion/world-schema.ts';
import type { Media } from '../companion/media.ts';
import type { Budget } from '../companion/budget.ts';
import type { ScreenObserver } from '../companion/screen.ts';
import type { Companion } from '../companion/service.ts';
import type { AppearanceService } from '../companion/appearance.ts';
import type { ConversationStore } from '../companion/conversation-store.ts';
export interface ManageServices {
  reality?: Reality;
  world: World;
  media: Media;
  budget: Budget;
  observer: ScreenObserver;
  companion: Companion;
  appearance: AppearanceService;
  conversationStore: ConversationStore;
}
function send(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}
async function input(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += String(chunk);
  return JSON.parse(raw);
}
function backup(s: ManageServices) {
  const world = s.world.read();
  const avatars = s.media.read();
  const names = [
    ...Object.values(avatars).filter((v): v is string => !!v),
    ...world.cards.map((c) => c.avatar).filter((v): v is string => !!v),
  ];
  return {
    format: 'fish-world-v1',
    at: Date.now(),
    world,
    companion: s.companion.read(),
    appearance: s.appearance.read(),
    conversations: s.conversationStore.read(),
    avatars,
    files: s.media.export(names),
  };
}
/** Called only after the app router has validated host, origin, capability and body size. */
export async function handleManagement(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  s: ManageServices,
): Promise<boolean> {
  const path = url.pathname,
    method = req.method ?? 'GET';
  if (path === '/avatar.jpg' || path === '/user-avatar.jpg' || path.startsWith('/media/')) {
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, { ok: false, message: '仅支持读取图片' }, 405);
      return true;
    }
    try {
      const name = path.startsWith('/media/')
        ? decodeURIComponent(path.slice(7))
        : path === '/avatar.jpg'
          ? s.media.read().fish
          : s.media.read().user;
      const bytes = name
        ? s.media.get(name)
        : path === '/avatar.jpg'
          ? readFileSync(join(PACKAGE_ROOT, 'assets/default-avatar.png'))
          : Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="28" fill="#dcebe2"/><text x="64" y="85" text-anchor="middle" font-size="64">我</text></svg>',
            );
      const mime = name?.endsWith('.png')
        ? 'image/png'
        : name?.endsWith('.webp')
          ? 'image/webp'
          : !name && path === '/user-avatar.jpg'
            ? 'image/svg+xml'
            : path === '/avatar.jpg' && !name
              ? 'image/png'
              : 'image/jpeg';
      res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(method === 'HEAD' ? undefined : bytes);
    } catch {
      send(res, { ok: false, message: '头像不存在' }, 404);
    }
    return true;
  }
  if (!path.startsWith('/manage/')) return false;
  try {
    if (method === 'GET') {
      if (path === '/manage/reality') send(res, s.reality?.read() ?? {});
      else if (path === '/manage/history') {
        const pet = z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,60}$/)
          .parse(url.searchParams.get('pet') ?? 'main');
        const limit = z
          .number()
          .int()
          .min(20)
          .max(200)
          .parse(Number(url.searchParams.get('limit') ?? 100));
        const before = z
          .number()
          .finite()
          .positive()
          .parse(Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER));
        const all = Object.values(s.conversationStore.read())
          .flatMap((bucket) => bucket[pet]?.messages ?? [])
          .sort((a, b) => a.ts - b.ts);
        const filtered = all.filter((m) => m.ts < before);
        let start = Math.max(0, filtered.length - limit);
        while (start > 0 && filtered[start - 1].ts === filtered[start]?.ts) start--;
        const messages = filtered.slice(start);
        send(res, { messages, hasMore: start > 0, earliestTs: messages[0]?.ts ?? null, total: all.length });
      } else if (path === '/manage/state')
        send(res, {
          world: s.world.read(),
          companion: s.companion.read(),
          appearance: s.appearance.read(),
          budget: s.budget.read(),
          screen: s.observer.read(),
          avatars: s.media.read(),
        });
      else if (path === '/manage/profile')
        send(res, {
          user: s.world.read().user,
          fish: s.world.read().fish,
          appearance: s.appearance.read(),
          avatars: s.media.read(),
        });
      else if (path === '/manage/backup') {
        res.setHeader('content-disposition', 'attachment; filename="fish-world-backup.json"');
        send(res, backup(s));
      } else if (path === '/manage/diary') {
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' });
        res.end(s.world.diary());
      } else send(res, { ok: false, message: '接口不存在' }, 404);
      return true;
    }
    if (method !== 'POST') {
      send(res, { ok: false, message: '仅支持GET或POST' }, 405);
      return true;
    }
    const raw = await input(req);
    if (path === '/manage/reality') {
      const p = z
        .object({ city: z.string().max(80), enabled: z.boolean() })
        .strict()
        .parse(raw);
      s.reality?.settings(p);
      send(res, { ok: true, reality: await s.reality?.lookup(true) });
      return true;
    } else if (path === '/manage/world') s.world.update(raw);
    else if (path === '/manage/story') s.world.story(raw);
    else if (path === '/manage/suggest') {
      const p = z.object({ storyId: z.string(), text: z.string() }).strict().parse(raw);
      s.world.suggest(p.storyId, p.text);
    } else if (path === '/manage/advance') {
      await s.world.advance(true);
      const issue = s.world.read().lastError;
      if (issue) {
        send(res, { ok: false, message: issue }, 409);
        return true;
      }
    } else if (path === '/manage/place') {
      const p = z.object({ item: z.string(), place: z.string() }).strict().parse(raw);
      s.world.place(p.item, p.place);
    } else if (path === '/manage/memory') s.companion.manageMemory(raw);
    else if (path === '/manage/event') {
      const p = z.object({ id: z.string() }).strict().parse(raw);
      s.world.hideEvent(p.id);
    } else if (path === '/manage/budget') s.budget.settings(raw);
    else if (path === '/manage/screen') s.observer.settings(raw);
    else if (path === '/manage/avatar') {
      const p = z
        .object({
          target: z.enum(['fish', 'user', 'character']),
          id: z.string().optional(),
          data: z.string().max(1000000),
        })
        .strict()
        .parse(raw);
      if (p.target === 'character') {
        const cards = s.world.read().cards;
        const card = cards.find((c) => c.id === p.id);
        if (!card) throw Error('角色不存在');
        card.avatar = s.media.put(p.data);
        s.world.update({ cards });
      } else s.media.set(p.target, p.data);
    } else if (path === '/manage/import-card') {
      const p = z
        .object({ kind: z.enum(['character', 'worldbook']), data: z.unknown() })
        .strict()
        .parse(raw);
      const wrapper = z.record(z.string(), z.unknown()).parse(p.data);
      const value = (wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : wrapper) as Record<
        string,
        unknown
      >;
      const state = s.world.read();
      if (p.kind === 'character') {
        s.world.update({
          cards: [
            ...state.cards,
            {
              id: randomUUID(),
              name: String(value.name ?? '新角色').slice(0, 40),
              enabled: true,
              description: String(value.description ?? '') + '\n' + String(value.scenario ?? ''),
              personality: String(value.personality ?? ''),
              goals: String(value.goals ?? ''),
              speech: String(value.mes_example ?? value.speech ?? '') + '\n' + String(value.first_mes ?? ''),
              relationship: String(value.relationship ?? ''),
              boundaries: String(value.boundaries ?? ''),
            },
          ],
        });
      } else {
        const container = (value.character_book ?? value) as Record<string, unknown>;
        const entries = Array.isArray(container.entries)
          ? container.entries
          : Object.values((container.entries ?? {}) as Record<string, unknown>);
        const books = entries.map((item) => {
          if (wrapper.format === 'fish-worldbook-v1') {
            return { ...bookSchema.parse(item), id: randomUUID() };
          }
          const e = z.record(z.string(), z.unknown()).parse(item);
          return {
            id: randomUUID(),
            name: String(e.name ?? e.comment ?? '导入条目').slice(0, 60),
            kind: 'rule',
            content: String(e.content ?? ''),
            keywords: Array.isArray(e.keys) ? e.keys.map(String) : [],
            always: e.constant === true,
            enabled: e.enabled !== false && e.disable !== true,
          };
        });
        if (!books.length) throw Error('没有找到世界书条目');
        s.world.update({ books: [...state.books, ...books] });
      }
    } else if (path === '/manage/restore') {
      const p = z
        .object({
          format: z.literal('fish-world-v1'),
          at: z.number(),
          world: z.unknown(),
          companion: z.unknown(),
          appearance: z.unknown(),
          conversations: z.unknown(),
          avatars: z.unknown(),
          files: z.record(z.string(), z.string().max(1000000)),
        })
        .strict()
        .parse(raw);
      const world = worldSchema.parse(p.world);
      if (!s.companion.validate(p.companion) || !s.conversationStore.validate(p.conversations))
        throw Error('备份格式无效');
      const appearance = s.appearance.validate(p.appearance);
      if (!appearance) throw Error('外观备份无效');
      s.media.validateBackup(
        p.avatars,
        p.files,
        world.cards.map((c) => c.avatar).filter((v): v is string => !!v),
      );
      const before = backup(s);
      const dest = join(dirname(s.world.read().diaryFile), 'before-import-' + Date.now() + '.json');
      writeFileSync(dest + '.tmp', JSON.stringify(before), 'utf8');
      renameSync(dest + '.tmp', dest);
      const renamed = s.media.restore(p.avatars, p.files);
      for (const card of world.cards)
        if (card.avatar) {
          if (!renamed[card.avatar]) throw Error('备份缺少角色头像');
          card.avatar = renamed[card.avatar];
        }
      s.world.restore(world);
      s.companion.restore(p.companion);
      s.appearance.save(p.appearance);
      s.conversationStore.restore(p.conversations);
    } else {
      send(res, { ok: false, message: '接口不存在' }, 404);
      return true;
    }
    send(res, { ok: true });
  } catch {
    send(res, { ok: false, message: '操作未完成：请检查输入格式、范围与文件内容。原有数据和恢复快照仍保留。' }, 400);
  }
  return true;
}
