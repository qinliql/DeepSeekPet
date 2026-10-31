/** User-owned companion presentation preferences, independent from API credentials. */
import { z } from 'zod';
import { RecoverableStore } from './store.ts';
const schema = z
  .object({
    name: z.string().trim().min(1).max(30).default('鱼团'),
    owner: z.string().trim().min(1).max(30).default('你'),
    sizePercent: z.number().int().min(50).max(180).default(100),
    fontSize: z.number().int().min(15).max(24).default(18),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#548eaa'),
    quiet: z.boolean().default(true),
    dragThrowEnabled: z.boolean().default(false),
    idleMinutes: z.number().int().min(2).max(60).default(8),
    personality: z.string().max(1200).default('嘴硬心软，爱摸鱼，贪吃但不吵闹。'),
  })
  .strict();
export type Appearance = z.infer<typeof schema>;
/** Persist only validated preferences; a partial save preserves the other values. */
export function createAppearance(root: string) {
  const store = new RecoverableStore(root, 'appearance', (v): v is Appearance => schema.safeParse(v).success);
  let value = schema.parse(store.read(() => schema.parse({})));
  return {
    read: () => ({ ...value }),
    validate: (input: unknown) => schema.safeParse(input).success,
    save(input: unknown) {
      const patch = schema.partial().parse(input);
      const supplied = input as Record<string, unknown>;
      const explicit = Object.fromEntries(
        Object.entries(patch).filter(([key]) => Object.prototype.hasOwnProperty.call(supplied, key)),
      );
      const next = schema.parse({ ...value, ...explicit });
      store.write(next);
      value = next;
      return { ...value };
    },
  };
}
export type AppearanceService = ReturnType<typeof createAppearance>;
