/** Local cropped avatars; only validated image bytes and generated filenames reach disk. */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { RecoverableStore } from './store.ts';
const nameSchema = z.string().regex(/^avatar-[a-f0-9-]+\.(jpg|png|webp)$/);
const indexSchema = z.object({ fish: nameSchema.optional(), user: nameSchema.optional() });
export function createMedia(root: string) {
  const dir = join(root, 'media');
  mkdirSync(dir, { recursive: true });
  const store = new RecoverableStore(
    root,
    'avatars',
    (v): v is z.infer<typeof indexSchema> => indexSchema.safeParse(v).success,
  );
  let data = store.read(() => ({}));
  function decode(raw: string) {
    const input = z.string().max(1000000).parse(raw);
    const m = input.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw Error('请选择JPEG、PNG或WebP图片');
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length || bytes.length > 700000) throw Error('头像过大，请先裁剪');
    const ok =
      m[1] === 'jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : m[1] === 'png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!ok) throw Error('头像内容与格式不符');
    return { bytes, extension: m[1] === 'jpeg' ? 'jpg' : m[1] };
  }
  function put(raw: string) {
    const { bytes, extension } = decode(raw);
    const name = 'avatar-' + randomUUID() + '.' + extension;
    writeFileSync(join(dir, name + '.tmp'), bytes);
    renameSync(join(dir, name + '.tmp'), join(dir, name));
    return name;
  }
  return {
    read: () => ({ ...data }),
    put,
    set(target: 'fish' | 'user', raw: string) {
      const name = put(raw);
      data = { ...data, [target]: name };
      store.write(data);
      return name;
    },
    get(name: string) {
      nameSchema.parse(name);
      return readFileSync(join(dir, name));
    },
    export(names: string[]) {
      return Object.fromEntries([...new Set(names)].map((name) => [name, this.get(name).toString('base64')]));
    },
    validateBackup(index: unknown, files: unknown, names: string[]) {
      const parsed = indexSchema.parse(index);
      const map = z.record(nameSchema, z.string().max(1000000)).parse(files);
      for (const name of [...Object.values(parsed).filter((v): v is string => !!v), ...names])
        if (!map[name]) throw Error('备份缺少头像文件');
      for (const [name, bytes] of Object.entries(map)) {
        const type = name.endsWith('.jpg') ? 'jpeg' : name.endsWith('.png') ? 'png' : 'webp';
        decode('data:image/' + type + ';base64,' + bytes);
      }
      return true;
    },
    restore(index: unknown, files: unknown) {
      const parsed = indexSchema.parse(index);
      const map = z.record(nameSchema, z.string().max(1000000)).parse(files);
      const renamed: Record<string, string> = {};
      for (const [name, bytes] of Object.entries(map)) {
        const type = name.endsWith('.jpg') ? 'jpeg' : name.endsWith('.png') ? 'png' : 'webp';
        renamed[name] = put('data:image/' + type + ';base64,' + bytes);
      }
      for (const value of Object.values(parsed)) if (value && !renamed[value]) throw Error('备份缺少头像文件');
      data = {
        fish: parsed.fish ? renamed[parsed.fish] : undefined,
        user: parsed.user ? renamed[parsed.user] : undefined,
      };
      store.write(data);
      return renamed;
    },
  };
}
export type Media = ReturnType<typeof createMedia>;
