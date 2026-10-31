/** Real-world context: system clock plus bounded, attributed location and weather queries. */
import { z } from 'zod';
import { RecoverableStore } from './store.ts';
const schema = z.object({ city: z.string().max(80).default(''), enabled: z.boolean().default(true) });
export function createReality(root: string, request: typeof fetch = fetch, now = Date.now) {
  const store = new RecoverableStore(root, 'reality', (v): v is z.infer<typeof schema> => schema.safeParse(v).success);
  let settings = schema.parse(store.read(() => ({ city: '', enabled: true })));
  let cache:
    | {
        at: number;
        city: string;
        source: string;
        latitude?: number;
        longitude?: number;
        weather?: unknown;
        error?: string;
      }
    | undefined;
  let pending: Promise<unknown> | undefined;
  async function json(url: string) {
    const response = await request(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw Error('现实信息服务暂不可用');
    return response.json();
  }
  async function lookup(force = false) {
    if (!settings.enabled) return { error: '位置与天气查询已关闭' };
    if (!force && cache && now() - cache.at < (cache.error ? 300000 : 1800000)) return cache;
    if (pending) return pending;
    pending = (async () => {
      const entry: NonNullable<typeof cache> = {
        at: now(),
        city: settings.city,
        source: settings.city ? '手动指定城市' : 'IP城市级近似定位，VPN可能影响结果',
      };
      try {
        if (settings.city) {
          const result = z
            .object({
              results: z
                .array(
                  z.object({
                    name: z.string(),
                    latitude: z.number().min(-90).max(90),
                    longitude: z.number().min(-180).max(180),
                  }),
                )
                .optional(),
            })
            .parse(
              await json(
                'https://geocoding-api.open-meteo.com/v1/search?name=' +
                  encodeURIComponent(settings.city) +
                  '&count=1&language=zh',
              ),
            );
          const place = result.results?.[0];
          if (!place) throw Error('未找到城市，请输入更完整的城市名称');
          Object.assign(entry, { city: place.name, latitude: place.latitude, longitude: place.longitude });
        } else {
          const place = z
            .object({
              success: z.boolean(),
              city: z.string().max(100),
              region: z.string().max(100),
              country: z.string().max(100),
              latitude: z.number().min(-90).max(90),
              longitude: z.number().min(-180).max(180),
            })
            .parse(await json('https://ipwho.is/'));
          if (!place.success) throw Error('自动定位失败，可手动设置城市');
          Object.assign(entry, {
            city: [place.country, place.region, place.city].join(' / '),
            latitude: place.latitude,
            longitude: place.longitude,
          });
        }
        const weather = z
          .object({
            current: z.object({
              time: z.string(),
              temperature_2m: z.number(),
              apparent_temperature: z.number(),
              relative_humidity_2m: z.number(),
              precipitation: z.number(),
              weather_code: z.number(),
              wind_speed_10m: z.number(),
            }),
            daily: z.object({
              time: z.array(z.string()),
              temperature_2m_max: z.array(z.number()),
              temperature_2m_min: z.array(z.number()),
              precipitation_probability_max: z.array(z.number().nullable()),
            }),
          })
          .parse(
            await json(
              'https://api.open-meteo.com/v1/forecast?latitude=' +
                entry.latitude +
                '&longitude=' +
                entry.longitude +
                '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto',
            ),
          );
        entry.weather = weather;
      } catch {
        entry.error = '查询暂未成功，不能据此判断天气。可重试或手动指定城市。';
      }
      cache = entry;
      return entry;
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  }
  return {
    read: () => ({
      settings,
      current: cache,
      time: new Date(now()).toLocaleString('zh-CN'),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    settings(value: unknown) {
      settings = schema.parse(value);
      store.write(settings);
      cache = undefined;
    },
    lookup,
    async context(query: string) {
      const time =
        '【真实系统时间】' +
        new Date(now()).toLocaleString('zh-CN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) +
        '；时区：' +
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      const relevant = /天气|气温|下雨|下雪|温度|穿什么|出门|在哪|位置|城市|现实/.test(query);
      const current = relevant ? await lookup() : cache;
      return (
        time +
        '\n【现实环境查询】' +
        JSON.stringify(current ?? { message: '尚未查询位置和天气' }) +
        '\n来源：IPWho.is（近似位置）、Open-Meteo（天气，摄氏度、毫米、km/h；WMO天气码）。只依据成功的查询回答；说明城市和天气资料时间。位置不等于GPS，不能推断用户精确地址。未查询或失败时不得编造。'
      );
    },
  };
}
export type Reality = ReturnType<typeof createReality>;
