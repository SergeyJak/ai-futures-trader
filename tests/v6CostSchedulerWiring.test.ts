import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredV6FrozenSplit, createV6CostResearchScheduler } from '../src/v6-cost-research-scheduler.js';

test('configured scheduler refuses missing boundaries and never queries database', async () => {
  assert.throws(() => configuredV6FrozenSplit({ V6_OOS_TEST_FROM: '2026-09-08T00:00:00Z' }), /boundaries/);
  let queries = 0;
  const pool = { query: async () => { queries++; return { rows: [] }; } } as any;
  const scheduler = createV6CostResearchScheduler(pool, configuredV6FrozenSplit({}));
  assert.equal(await scheduler.run(), false);
  assert.equal(queries, 0);
});

test('scheduler catches database failures and allows subsequent attempts', async () => {
  let calls = 0;
  const pool = { query: async () => { calls++; throw Error('database unavailable'); } } as any;
  const scheduler = createV6CostResearchScheduler(pool, {
    trainBefore: '2026-09-01T00:00:00Z', testFrom: '2026-09-08T00:00:00Z',
    testBefore: '2026-10-01T00:00:00Z', embargoHours: 168,
  });
  assert.equal(await scheduler.run(), false);
  assert.equal(await scheduler.run(), false);
  assert.equal(calls, 2);
  assert.equal((scheduler.snapshot() as {status:string}).status, 'failed');
});
