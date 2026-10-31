import { createStandaloneAi } from '../standalone/ai-provider.ts';
/** Preflight budget reservations block network I/O; usage and month rollover are durable. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBudget, BudgetLimitError } from './budget.ts';
const request = (max = 32) => ({
  method: 'POST',
  body: JSON.stringify({ model: 'deepseek-flash', max_tokens: max, messages: [{ role: 'user', content: '你好' }] }),
});
async function settled(b: ReturnType<typeof createBudget>) {
  for (let i = 0; i < 30; i++) {
    if (b.read().rows.every((r) => r.status !== 'reserved')) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('Ledger not settled');
}
test('no network request is issued when the reservation would exceed the cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-budget-'));
  try {
    const b = createBudget(dir);
    b.settings({ limit: 1, planning: 1, outputRate: 1000 });
    let calls = 0;
    const fetcher = b.wrap(async () => {
      calls++;
      return new Response('ok');
    });
    await assert.rejects(fetcher('https://example.test', request(4096)), BudgetLimitError);
    assert.equal(calls, 0);
    assert.equal(b.read().spent, 0);
    assert.throws(() => b.settings({ limit: 21 }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('all categories reconcile usage; absent usage remains conservatively charged across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-budget-'));
  let time = new Date(2026, 9, 31, 10).getTime();
  try {
    const b = createBudget(dir, () => time);
    const fetcher = b.wrap(
      async () =>
        new Response(
          'data: ' + JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5 } }) + '\n\ndata: [DONE]\n\n',
        ),
    );
    await b.run('world', () => fetcher('https://example.test', request()));
    await settled(b);
    assert.equal(b.read().rows[0].kind, 'world');
    assert.equal(b.read().rows[0].status, 'usage');
    assert.ok(b.read().spent > 0 && b.read().spent < 0.001);
    await b.wrap(async () => new Response('{}'))('https://example.test', request());
    await settled(b);
    assert.equal(b.read().rows[1].status, 'estimated');
    const cost = b.read().spent;
    const restored = createBudget(dir, () => time);
    assert.equal(restored.read().spent, cost);
    time = new Date(2026, 10, 1, 10).getTime();
    assert.equal(restored.read().spent, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SDK wrapping preserves a useful budget error without sending a provider request', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-budget-sdk-'));
  let calls = 0;
  try {
    const b = createBudget(dir);
    b.settings({ limit: 1, planning: 1, outputRate: 1000 });
    const ai = createStandaloneAi(
      dir,
      { info() {}, warn() {}, error() {}, debug() {} },
      {
        fetch: b.wrap(async () => {
          calls++;
          return new Response('{}');
        }),
      },
    );
    await ai.saveSettings({
      baseUrl: 'https://example.test',
      model: 'deepseek-flash',
      apiKey: 'local-test-only',
      enabled: true,
    });
    await assert.rejects(async () => {
      for await (const part of ai.stream({
        provider: 'standalone',
        model: 'deepseek-flash',
        messages: [{ role: 'user', content: 'hi' }],
      }))
        void part;
    }, /预算/);
    assert.equal(calls, 0);
    ai.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cache hits use the lower protected rate when provider usage reports them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-budget-cache-'));
  try {
    const b = createBudget(dir);
    await b.wrap(
      async () =>
        new Response(
          'data: ' +
            JSON.stringify({
              choices: [],
              usage: { prompt_tokens: 100, completion_tokens: 5, prompt_cache_hit_tokens: 90 },
            }) +
            '\n\n',
        ),
    )('https://example.test', request());
    await settled(b);
    assert.equal(b.read().rows[0].cached, 90);
    assert.ok(Math.abs(b.read().spent - (10 * 3 + 90 * 0.06 + 5 * 10) / 1e6) < 1e-12);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prior same-month spend can be recorded without clearing measured requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fish-budget-opening-'));
  try {
    const b = createBudget(dir);
    b.settings({ limit: 1, planning: 1, previousSpend: 0.99 });
    let calls = 0;
    await assert.rejects(
      b.wrap(async () => {
        calls++;
        return new Response('{}');
      })('https://example.test', request(4096)),
      BudgetLimitError,
    );
    assert.equal(calls, 0);
    assert.equal(b.read().previousSpend, 0.99);
    const reloaded = createBudget(dir);
    assert.equal(reloaded.read().spent, 0.99);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
