import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReality } from './reality.ts';
test('real context caches successful weather, avoids fabricated offline data, and honors disabled lookup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fish-reality-'));
  let calls = 0;
  try {
    const request = (async (url: string | URL | Request) => {
      calls++;
      const target = String(url);
      return Response.json(
        target.includes('ipwho')
          ? { success: true, city: 'City', region: 'Region', country: 'Country', latitude: 30, longitude: 120 }
          : {
              current: {
                time: '2026-10-31T18:00',
                temperature_2m: 20,
                apparent_temperature: 19,
                relative_humidity_2m: 50,
                precipitation: 0,
                weather_code: 0,
                wind_speed_10m: 8,
              },
              daily: {
                time: ['2026-10-31'],
                temperature_2m_max: [22],
                temperature_2m_min: [15],
                precipitation_probability_max: [0],
              },
            },
      );
    }) as typeof fetch;
    const reality = createReality(root, request, () => Date.UTC(2026, 9, 31));
    assert.match(await reality.context('你好'), /尚未查询/);
    assert.equal(calls, 0);
    assert.match(await reality.context('天气'), /temperature_2m/);
    assert.equal(calls, 2);
    await reality.context('下雨吗');
    assert.equal(calls, 2);
    reality.settings({ city: '', enabled: false });
    assert.match(JSON.stringify(await reality.lookup()), /关闭/);
    assert.equal(calls, 2);
    const offline = createReality(root, (async () => {
      throw Error('offline');
    }) as typeof fetch);
    offline.settings({ city: '', enabled: true });
    assert.match(JSON.stringify(await offline.lookup()), /暂未成功/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
