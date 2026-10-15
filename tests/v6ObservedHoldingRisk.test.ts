import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeObservedHoldingRisk } from '../src/research/v6ObservedHoldingRisk.js';
import type { ClosedPosition } from '../src/research/v6CostStress.js';

const trades: ClosedPosition[] = [
  { source: 'kopyon', traderId: 'a', positionId: '1', symbol: 'SOLUSDT', openedAt: '2026-10-07T00:00:00Z', closedAt: '2026-10-07T01:00:00Z', grossReturnPct: 1 },
  { source: 'kopyon', traderId: 'a', positionId: '2', symbol: 'SOLUSDT', openedAt: '2026-10-08T00:00:00Z', closedAt: '2026-10-11T00:00:00Z', grossReturnPct: -0.5 },
  { source: 'kopyon', traderId: 'b', positionId: '3', symbol: 'BTCUSDT', openedAt: '2026-10-12T00:00:00Z', closedAt: '2026-10-12T10:00:00Z', grossReturnPct: 0.1 },
];

test('holding durations and costs are descriptive', () => {
  const r = summarizeObservedHoldingRisk(trades);
  assert.equal(r.closedCount, 3);
  assert.equal(r.medianHoldingHours, 10);
  assert.equal(r.p90HoldingHours, 72);
  assert.equal(r.grossPriceMove.worstPct, -0.5);
  assert.equal(r.estimatedCostSensitivityExcludingFunding[0].roundTripCostPct, 0.16);
  assert.equal(r.estimatedCostSensitivityExcludingFunding[2].roundTripCostPct, 0.5);
  assert.equal(r.estimatedCostSensitivityExcludingFunding[0].fundingKnownCount, 0);
});

test('invalid holding timestamps are excluded from duration statistics', () => {
  const r = summarizeObservedHoldingRisk([{ ...trades[0], openedAt: undefined }]);
  assert.equal(r.validHoldingCount, 0);
  assert.equal(r.medianHoldingHours, null);
});
