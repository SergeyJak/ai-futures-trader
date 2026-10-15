import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredV6FrozenSplit, createV6CostResearchScheduler } from '../src/v6-cost-research-scheduler.js';

test('disabled without immutable boundaries', () => {
  assert.equal(configuredV6FrozenSplit({}), null);
  assert.throws(() => configuredV6FrozenSplit({ V6_OOS_TRAIN_BEFORE: '2026-01-01' }), /boundaries/);
});

test('fixed boundaries and embargo configured explicitly', () => {
  const split = configuredV6FrozenSplit({
    V6_OOS_TRAIN_BEFORE: '2026-09-01T00:00:00Z',
    V6_OOS_TEST_FROM: '2026-09-08T00:00:00Z',
    V6_OOS_TEST_BEFORE: '2026-10-01T00:00:00Z',
  });
  assert.equal(split?.embargoHours, 168);
});

test('disabled scheduler does not query database', async () => {
  const pool = { query: () => { throw Error('unexpected query'); } } as any;
  const scheduler = createV6CostResearchScheduler(pool, null);
  assert.equal(await scheduler.run(), false);
  assert.deepEqual(scheduler.snapshot(), { status: 'not-configured' });
});
