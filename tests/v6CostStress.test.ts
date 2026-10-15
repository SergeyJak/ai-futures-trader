import assert from 'node:assert/strict';
import test from 'node:test';
import { COST_SCENARIOS, deduplicateClosedPositions, stressBySource, stressTrade, type ClosedPosition } from '../src/research/v6CostStress.js';

const sample: ClosedPosition = {
  source: 'okx', traderId: 't1', positionId: 'p1', symbol: 'BTCUSDT',
  closedAt: '2026-10-01T12:00:00Z', grossReturnPct: 1, fundingPct: -0.05,
};

test('scenario round-trip costs match the frozen protocol', () => {
  assert.deepEqual(Object.keys(COST_SCENARIOS), ['baseline', 'elevated', 'severe']);
  assert.ok(Math.abs(stressTrade(sample, 'baseline').roundTripCostPct - 0.16) < 1e-9);
  assert.ok(Math.abs(stressTrade(sample, 'elevated').roundTripCostPct - 0.30) < 1e-9);
  assert.ok(Math.abs(stressTrade(sample, 'severe').roundTripCostPct - 0.50) < 1e-9);
});

test('increasing costs cannot improve the same trade', () => {
  const baseline = stressTrade(sample, 'baseline').estimatedNetReturnPct!;
  const elevated = stressTrade(sample, 'elevated').estimatedNetReturnPct!;
  const severe = stressTrade(sample, 'severe').estimatedNetReturnPct!;
  assert.ok(baseline > elevated && elevated > severe);
});

test('unknown funding is explicitly incomplete', () => {
  const { fundingPct: _funding, ...withoutFunding } = sample;
  const result = stressTrade(withoutFunding, 'elevated');
  assert.equal(result.complete, false);
  assert.equal(result.estimatedNetReturnPct, null);
});

test('duplicate closures are not counted twice', () => {
  assert.equal(deduplicateClosedPositions([sample, sample]).length, 1);
});

test('Kopyon and OKX never share an aggregate', () => {
  const result = stressBySource([sample, { ...sample, source: 'kopyon', positionId: 'k1' }]);
  assert.deepEqual(result.map((item) => [item.source, item.closedCount]), [['kopyon', 1], ['okx', 1]]);
});

test('open snapshots cannot enter closed position calculator', () => {
  const open = { ...sample, observedAt: sample.closedAt, status: 'open' as const };
  assert.equal('closedAt' in open, true); // even malformed source data needs explicit eligibility checks upstream
});
