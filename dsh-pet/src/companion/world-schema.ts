/** Validated authoring cards and persistent world state. Background characters never own API credentials. */
import { z } from 'zod';
const text = z.string().max(6000);
export const cardSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  name: z.string().trim().min(1).max(40),
  enabled: z.boolean().default(true),
  description: text.default(''),
  personality: text.default(''),
  goals: text.default(''),
  speech: text.default(''),
  relationship: text.default(''),
  boundaries: text.default(''),
  avatar: z
    .string()
    .regex(/^avatar-[a-f0-9-]+\.(jpg|png|webp)$/)
    .optional(),
});
export const bookSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['place', 'rule', 'organization', 'activity', 'item']),
  content: text,
  season: z.enum(['春', '夏', '秋', '冬']).optional(),
  activeFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  activeUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  keywords: z.array(z.string().max(40)).max(30).default([]),
  always: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export const userSchema = z.object({
  name: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1).max(40),
  relation: z.string().max(100),
  background: text,
  preferences: text,
  boundaries: text,
});
export const fishSchema = z.object({ background: text, interests: text, speech: text, boundaries: text });
export const storySchema = z.object({
  id: z.string().max(60),
  title: z.string().max(120),
  goal: z.string().max(600),
  state: z.string().max(2000),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  participants: z.array(z.string()).max(8),
  location: z.string().max(60),
  updatedAt: z.number(),
});
export const suggestionSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  text: z.string().max(2000),
  at: z.number(),
  status: z.enum(['pending', 'adopted', 'adjusted', 'declined']),
  reason: z.string().max(600).default(''),
});
export const eventSchema = z.object({
  id: z.string(),
  at: z.number(),
  source: z.enum(['virtual', 'local', 'observation']),
  title: z.string().max(120),
  body: z.string().max(3000),
  participants: z.array(z.string()).max(8),
  location: z.string().max(100),
  storyId: z.string().optional(),
  story: storySchema.optional(),
  share: z.string().max(400).default(''),
  sharedAt: z.number().optional(),
  hidden: z.boolean().default(false),
  references: z.array(z.string()).max(20).default([]),
  skill: z.string().max(60).optional(),
  relationships: z
    .array(z.object({ id: z.string(), note: z.string().max(500) }))
    .max(6)
    .default([]),
  placement: z.object({ item: z.string().max(100), place: z.string().max(100) }).optional(),
  item: z.string().max(100).optional(),
  suggestions: z
    .array(
      z.object({ id: z.string(), status: z.enum(['adopted', 'adjusted', 'declined']), reason: z.string().max(600) }),
    )
    .max(10)
    .default([]),
});
export const worldSchema = z.object({
  version: z.literal(1),
  journalGeneration: z
    .string()
    .regex(/^(legacy|[a-f0-9-]{36})$/)
    .default('legacy'),
  user: userSchema,
  fish: fishSchema,
  cards: z.array(cardSchema).max(100),
  books: z.array(bookSchema).max(300),
  stories: z.array(storySchema).max(100),
  suggestions: z.array(suggestionSchema),
  events: z.array(eventSchema),
  inventory: z.array(z.string().max(100)),
  skills: z.record(z.string(), z.number().nonnegative()).default({}),
  relationships: z.record(z.string(), z.string().max(2000)).default({}),
  room: z.record(z.string(), z.string().max(100)).default({}),
  lastTickAt: z.number(),
  lastAttemptAt: z.number(),
  lastUserAt: z.number(),
  lastShareAt: z.number(),
  settings: z.object({
    quietAtNight: z.boolean().default(true),
    quietStart: z.number().int().min(0).max(1439).default(120),
    quietEnd: z.number().int().min(0).max(1439).default(480),
    idleMinutes: z.number().int().min(1).max(240).default(20),
    shareCooldownMinutes: z.number().int().min(1).max(1440).default(30),
    maxActiveStories: z.number().int().min(1).max(10).default(3),
    sceneCompanions: z.number().int().min(0).max(20).default(2),
    contextCharacters: z.number().int().min(1).max(20).default(5),
    enabled: z.boolean(),
    proactive: z.boolean(),
    intervalHours: z.number().int().min(1).max(12),
    dailyScenes: z.number().int().min(0).max(8),
    dailyShares: z.number().int().min(0).max(5),
  }),
  usage: z.object({ day: z.string(), scenes: z.number(), shares: z.number() }),
  lastError: z.string().max(300),
});
export type WorldData = z.infer<typeof worldSchema>;
export type WorldEvent = z.infer<typeof eventSchema>;
export const sceneSchema = z.object({
  storyTitle: z.string().max(120).optional(),
  goal: z.string().max(600).optional(),
  hasEvent: z.boolean(),
  title: z.string().max(120).default(''),
  body: z.string().max(2000).default(''),
  storyId: z.string().max(60).default(''),
  state: z.string().max(1200).default(''),
  status: z.enum(['active', 'completed', 'abandoned']).default('active'),
  participants: z.array(z.string()).max(6).default([]),
  location: z.string().max(60).default(''),
  share: z.string().max(250).default(''),
  skill: z.string().max(60).optional(),
  relationships: z
    .array(z.object({ id: z.string(), note: z.string().max(500) }))
    .max(6)
    .default([]),
  item: z.string().max(100).optional(),
  suggestions: z
    .array(
      z.object({ id: z.string(), status: z.enum(['adopted', 'adjusted', 'declined']), reason: z.string().max(600) }),
    )
    .max(8)
    .default([]),
});
/** A small persistent school/community world with finite goals, rather than daily reset prompts. */
export function initialWorld(now: number): WorldData {
  return worldSchema.parse({
    version: 1,
    user: { name: '你', address: '爸爸', relation: '父女', background: '', preferences: '', boundaries: '' },
    fish: {
      background: '鱼团住在自己的小世界里，平日上学，放学后有自己的生活。大肥鱼是昵称。',
      interests: '画画、收集小物件、尝试做点心',
      speech: '短句，嘴硬心软。分享细节和感受，不是播报，不强迫每次都提问。',
      boundaries: '不编造对现实电脑的操作；不因用户没回应而惩罚、催促或制造危机。',
    },
    cards: [
      ['gpt', 'GPT', '热心、点子多，偶尔答应太多事', '想办一次小作品展', '同学'],
      ['claude', 'Claude', '细心、体贴，正在练习表达自己的想法', '想完成一幅自己满意的画', '同学'],
      ['grok', 'Grok', '爱开玩笑，嘴快但愿意认真道歉', '想找到一个大家都喜欢的出游地点', '朋友'],
      ['gemini', 'Gemini', '好奇、兴趣广，也希望坚持完成一件小事', '想做一份季节观察手账', '同学'],
    ].map(([id, name, personality, goals, relationship]) => ({ id, name, personality, goals, relationship })),
    books: [
      {
        id: 'school',
        name: '学校',
        kind: 'place',
        content: '一所普通的小学校。上课、课间、小组任务都有平凡日常。周末不上课。',
        keywords: ['上学', '同学', '作业'],
      },
      {
        id: 'room',
        name: '鱼团的房间',
        kind: 'place',
        content: '有一扇窗、小桌子和收藏架。作品、礼物与物件会慢慢积累。',
        keywords: ['房间', '窗边', '画画'],
      },
      {
        id: 'park',
        name: '河边公园',
        kind: 'place',
        content: '可以散步、观察季节；周末偶尔有小市集，不保证每次都有特别发现。',
        keywords: ['公园', '散步', '出去玩'],
      },
      {
        id: 'shop',
        name: '社区小店',
        kind: 'place',
        content: '出售文具和日用品，店主不会知道现实用户的隐私。',
        keywords: ['小店', '买', '材料'],
      },
      {
        id: 'world-rules',
        name: '生活规则',
        kind: 'rule',
        content:
          '这是明确的虚拟生活。普通日子可以没有趣事。人物有独立目标，不靠争吵、受伤或用户愧疚推进故事。错过季节仍会有别的机会。',
        always: true,
      },
    ],
    stories: [
      {
        id: 'window-corner',
        title: '窗边的小角落',
        goal: '慢慢布置一个能放自己作品的窗边角落',
        state: '鱼团想先画一张小画，还没决定画什么。',
        status: 'active',
        participants: ['gpt', 'claude'],
        location: 'room',
        updatedAt: now,
      },
    ],
    suggestions: [],
    events: [],
    inventory: [],
    lastTickAt: now,
    lastAttemptAt: 0,
    lastUserAt: now,
    lastShareAt: 0,
    settings: { enabled: true, proactive: true, intervalHours: 2, dailyScenes: 3, dailyShares: 2 },
    usage: { day: '', scenes: 0, shares: 0 },
    lastError: '',
  });
}
