/** App-local monthly budget with durable preflight reservations and usage reconciliation. */
import { z } from 'zod';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { RecoverableStore } from './store.ts';
export class BudgetLimitError extends Error {
  constructor() {
    super('本月应用预算已到保护线，已暂停新的API请求；本地生活仍会继续。');
    this.name = 'BudgetLimitError';
  }
}
export type SpendKind = 'chat' | 'memory' | 'world' | 'screen' | 'share' | 'test';
const rateSchema = z.object({
  limit: z.number().min(1).max(20).default(20),
  planning: z.number().min(1).max(20).default(15),
  inputRate: z.number().min(0.1).max(1000).default(3),
  cachedRate: z.number().min(0.01).max(1000).default(0.06),
  outputRate: z.number().min(0.1).max(1000).default(10),
});
const rowSchema = z.object({
  id: z.string(),
  month: z.string(),
  at: z.number(),
  kind: z.string(),
  reserved: z.number().nonnegative(),
  charged: z.number().nonnegative(),
  inputRate: z.number().optional(),
  cachedRate: z.number().optional(),
  cached: z.number().optional(),
  outputRate: z.number().optional(),
  status: z.enum(['reserved', 'usage', 'estimated']),
  input: z.number().optional(),
  output: z.number().optional(),
});
const schema = z.object({
  version: z.literal(1),
  settings: rateSchema,
  opening: z.record(z.string(), z.number().min(0).max(20)).default({}),
  rows: z.array(rowSchema),
});
/** Rates are conservative CNY per million tokens; this ledger never reads API keys. */
export function createBudget(root: string, now: () => number = Date.now) {
  const store = new RecoverableStore(root, 'budget', (v): v is z.infer<typeof schema> => schema.safeParse(v).success);
  const data = schema.parse(store.read(() => ({ version: 1, settings: rateSchema.parse({}), opening: {}, rows: [] })));
  const scope = new AsyncLocalStorage<SpendKind>();
  const month = () => {
    const d = new Date(now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };
  const total = () =>
    (data.opening[month()] ?? 0) +
    data.rows
      .filter((r) => r.month === month())
      .reduce((n, r) => n + (r.status === 'reserved' ? r.reserved : r.charged), 0);
  function settle(id: string, input?: number, output?: number, cached = 0) {
    const row = data.rows.find((r) => r.id === id);
    if (!row) return;
    if (input !== undefined && output !== undefined) {
      row.input = input;
      row.output = output;
      row.cached = Math.max(0, Math.min(input, cached));
      row.charged =
        ((input - row.cached) * (row.inputRate ?? 12) +
          row.cached * (row.cachedRate ?? 0.4) +
          output * (row.outputRate ?? 40)) /
        1e6;
      row.status = 'usage';
    } else {
      row.charged = row.reserved;
      row.status = 'estimated';
    }
    store.write(data);
  }
  // A crash never frees an unverified reservation: it remains a conservative charge.
  for (const row of data.rows)
    if (row.status === 'reserved') {
      row.status = 'estimated';
      row.charged = row.reserved;
    }
  function reserve(input: number, output: number, kind: SpendKind, model = 'deepseek-flash') {
    const premium = /pro|claude|gpt|gemini/i.test(model);
    const inputRate = Math.max(data.settings.inputRate, premium ? 12 : 3),
      outputRate = Math.max(data.settings.outputRate, premium ? 40 : 10);
    const value = (input * inputRate + output * outputRate) / 1e6;
    const ceiling = ['world', 'screen', 'share'].includes(kind)
      ? Math.min(data.settings.planning, data.settings.limit)
      : data.settings.limit;
    if (total() + value > ceiling) throw new BudgetLimitError();
    const row = {
      id: randomUUID(),
      month: month(),
      at: now(),
      kind,
      inputRate,
      cachedRate: Math.max(data.settings.cachedRate, premium ? 0.4 : 0.06),
      outputRate,
      reserved: value,
      charged: 0,
      status: 'reserved' as const,
    };
    data.rows.push(row);
    store.write(data);
    return row.id;
  }
  /** Wrap every provider request, including connection tests, before any network I/O. */
  const wrap =
    (fetcher: typeof fetch): typeof fetch =>
    async (url, init) => {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(String(init?.body ?? '{}'));
      } catch {
        throw new Error('无法估算请求预算，未发送请求。');
      }
      const compact = JSON.stringify(body).replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image:1024tokens]');
      const imageCount = (JSON.stringify(body).match(/data:image\//g) ?? []).length;
      const max = Number(body.max_tokens ?? body.max_completion_tokens ?? 4096);
      if (!Number.isFinite(max) || max < 1 || max > 4096) throw new Error('请求输出预算超出应用限制');
      const id = reserve(
        Buffer.byteLength(compact, 'utf8') + imageCount * 1024,
        max,
        scope.getStore() ?? 'chat',
        String(body.model ?? ''),
      );
      let response: Response;
      try {
        response = await fetcher(url, init);
      } catch (error) {
        settle(id);
        throw error;
      }
      void (async () => {
        try {
          const reader = response.clone().body?.getReader();
          let raw = '',
            size = 0;
          if (!reader) {
            settle(id);
            return;
          }
          const decoder = new TextDecoder();
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > 2 * 1024 * 1024) {
              void reader.cancel();
              settle(id);
              return;
            }
            raw += decoder.decode(part.value, { stream: true });
          }
          let usage:
            | {
                prompt_tokens?: number;
                completion_tokens?: number;
                prompt_cache_hit_tokens?: number;
                prompt_tokens_details?: { cached_tokens?: number };
              }
            | undefined;
          for (const line of raw.split('\n'))
            try {
              const parsed = JSON.parse(line.startsWith('data:') ? line.slice(5) : line);
              if (parsed.usage) usage = parsed.usage;
            } catch {
              /* SSE terminator or incomplete line. */
            }
          if (usage && Number.isFinite(usage.prompt_tokens) && Number.isFinite(usage.completion_tokens))
            settle(
              id,
              usage.prompt_tokens,
              usage.completion_tokens,
              Number(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0),
            );
          else settle(id);
        } catch {
          try {
            settle(id);
          } catch {
            /* Durable reservation remains the conservative charge. */
          }
        }
      })();
      return response;
    };
  return {
    wrap,
    run: <T>(kind: SpendKind, fn: () => T): T => scope.run(kind, fn),
    read() {
      return {
        month: month(),
        settings: { ...data.settings },
        spent: total(),
        previousSpend: data.opening[month()] ?? 0,
        rows: data.rows.filter((r) => r.month === month()).map((r) => ({ ...r })),
        accounting: 'usage时按已配置单价计账，无usage或中断按预留上限保守计账；不包含其他应用费用。',
      };
    },
    settings(input: unknown) {
      const { previousSpend, ...next } = rateSchema
        .partial()
        .extend({ previousSpend: z.number().min(0).max(20).optional() })
        .strict()
        .parse(input);
      if (previousSpend !== undefined) data.opening[month()] = previousSpend;
      data.settings = rateSchema.parse({ ...data.settings, ...next });
      if (data.settings.planning > data.settings.limit) data.settings.planning = data.settings.limit;
      store.write(data);
      return this.read();
    },
    backgroundAllowed: () => total() < Math.min(data.settings.planning, data.settings.limit),
  };
}
export type Budget = ReturnType<typeof createBudget>;
