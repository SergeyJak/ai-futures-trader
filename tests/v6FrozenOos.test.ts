import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFrozenCohort, groupFrozenOosBySource, type FrozenSplit } from '../src/research/v6FrozenOos.js';
import type { ClosedPosition } from '../src/research/v6CostStress.js';

const split: FrozenSplit = {
  trainBefore: '2026-10-01T00:00:00Z',
  testFrom: '2026-10-08T00:00:00Z',
  testBefore: '2026-10-15T00:00:00Z',
  embargoHours: 168,
};
const sample: ClosedPosition = {
  source: 'okx', traderId: 't', positionId: 'p', symbol: 'SOLUSDT',
  closedAt: '2026-10-09T00:00:00Z', grossReturnPct: 1,
};

test('frozen chronological windows remain stable as new positions arrive', () => {
  assert.equal(classifyFrozenCohort(sample, split), 'test');
  assert.equal(classifyFrozenCohort({ ...sample, closedAt: '2026-10-16T00:00:00Z' }, split), 'outside');
  assert.equal(classifyFrozenCohort({ ...sample, closedAt: '2026-10-05T00:00:00Z' }, split), 'embargo');
  assert.equal(classifyFrozenCohort({ ...sample, closedAt: '2026-09-30T00:00:00Z' }, split), 'train');
});

test('reject insufficient embargo and invalid dates', () => {
  assert.throws(() => classifyFrozenCohort(sample, { ...split, embargoHours: 169 }), /embargo/);
  assert.throws(() => classifyFrozenCohort(sample, { ...split, testFrom: 'invalid' }), /Invalid/);
});

test('separate source cohorts', () => {
  const grouped = groupFrozenOosBySource([sample, { ...sample, source: 'kopyon' }], split);
  assert.equal(grouped.okx.test.length, 1);
  assert.equal(grouped.kopyon.test.length, 1);
});
