/** Local audio library. Private paths stay on disk; the UI only receives opaque track IDs. */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { realpathSync, statSync, createReadStream } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RecoverableStore } from './store.ts';
const mode = z.enum(['list', 'single', 'random']);
const schema = z.object({
  tracks: z.array(z.object({ id: z.string().uuid(), path: z.string(), title: z.string().max(300) })).max(2000),
  mode: mode.default('list'),
  volume: z.number().min(0).max(1).default(0.6),
  currentId: z.string().default(''),
  position: z.number().min(0).max(864000).default(0),
});
const types: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};
export function createMusic(root: string) {
  const store = new RecoverableStore(
    root,
    'music',
    (value): value is z.infer<typeof schema> => schema.safeParse(value).success,
  );
  const data = schema.parse(store.read(() => schema.parse({ tracks: [] })));
  const save = () => store.write(data);
  const read = () => ({ ...data, tracks: data.tracks.map(({ id, title }) => ({ id, title })) });
  return {
    read,
    add(paths: string[]) {
      let added = 0,
        skipped = 0;
      for (const path of paths) {
        try {
          const real = realpathSync(path);
          const ext = extname(real).toLowerCase();
          if (!types[ext] || !statSync(real).isFile() || !statSync(real).size || data.tracks.length >= 2000) {
            skipped++;
            continue;
          }
          const key = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
          if (data.tracks.some((t) => key(t.path) === key(real))) {
            skipped++;
            continue;
          }
          data.tracks.push({ id: randomUUID(), path: real, title: basename(real).slice(0, 300) });
          added++;
        } catch {
          skipped++;
        }
      }
      if (!data.currentId) data.currentId = data.tracks[0]?.id ?? '';
      save();
      return { state: read(), added, skipped };
    },
    control(input: unknown) {
      const p = z
        .object({
          action: z.enum(['settings', 'select', 'remove', 'clear']),
          id: z.string().optional(),
          mode: mode.optional(),
          volume: z.number().min(0).max(1).optional(),
          position: z.number().min(0).max(864000).optional(),
        })
        .strict()
        .parse(input);
      if (p.action === 'clear') {
        data.tracks = [];
        data.currentId = '';
        data.position = 0;
      }
      if (p.action === 'remove') {
        data.tracks = data.tracks.filter((t) => t.id !== p.id);
        if (data.currentId === p.id) {
          data.currentId = data.tracks[0]?.id ?? '';
          data.position = 0;
        }
      }
      if (p.action === 'select') {
        if (!data.tracks.some((t) => t.id === p.id)) throw Error('歌曲已不在列表中');
        if (data.currentId !== p.id) data.position = 0;
        data.currentId = p.id!;
      }
      if (p.mode !== undefined) data.mode = p.mode;
      if (p.volume !== undefined) data.volume = p.volume;
      if (p.position !== undefined && (!p.id || p.id === data.currentId)) data.position = p.position;
      save();
      return read();
    },
    stream(req: IncomingMessage, res: ServerResponse, id: string) {
      const track = data.tracks.find((t) => t.id === id);
      if (!track) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const info = statSync(track.path);
        if (!info.isFile()) throw Error('Missing');
        const size = info.size;
        if (size <= 0) throw Error('Empty');
        let start = 0,
          end = size - 1,
          status = 200;
        const range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { 'content-range': `bytes */${size}` });
            res.end();
            return;
          }
          if (!match[1]) start = Math.max(0, size - Number(match[2]));
          else {
            start = Number(match[1]);
            if (match[2]) end = Math.min(end, Number(match[2]));
          }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
            res.writeHead(416, { 'content-range': `bytes */${size}` });
            res.end();
            return;
          }
          status = 206;
        }
        res.writeHead(status, {
          'content-type': types[extname(track.path).toLowerCase()] ?? 'application/octet-stream',
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const file = createReadStream(track.path, { start, end });
        file.on('error', () => res.destroy());
        res.on('close', () => file.destroy());
        file.pipe(res);
      } catch {
        res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('音频文件已移动或无法读取，请移除后重新添加。');
      }
    },
  };
}
export type Music = ReturnType<typeof createMusic>;
