import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalCostStressReport } from '../src/research/v6HistoricalCostReport.js';

test('frozen OOS funding coverage remains explicitly incomplete', async () => {
  const row = {
    source: 'kopyon', trader_id: 'trader-1', position_id: 'position-1',
    symbol: 'BTCUSDT', side: 'LONG',
    opened_at: '2026-10-08T00:00:00Z', closed_at: '2026-10-09T00:00:00Z',
    entry_price: '100', exit_price: '101',
  };
  const pool = { query: async (sql: string) => ({ rows: sql.includes('v6_position_observations') ? [row] : [] }) };
  const report = await historicalCostStressReport(pool as never, {
    trainBefore: '2026-09-30T00:00:00Z',
    testFrom: '2026-10-07T00:00:00Z',
    testBefore: '2026-10-15T00:00:00Z',
    embargoHours: 168,
  });
  assert.deepEqual(report.fundingCoverage.map(x => [x.source, x.testPositions, x.fundedPositions, x.missingPositions]), [
    ['kopyon', 1, 0, 1], ['okx', 0, 0, 0],
  ]);
  assert.equal(report.results[0].observedTestCostScenarios[0].averageNetReturnPct, null);
});

test('raw provider funding fields are audited but never counted as verified settlement', async () => {
  const base = {
    source: 'kopyon' as const, trader_id: 'trader-1', position_id: 'position-1',
    symbol: 'SOLUSDT', side: 'LONG',
    opened_at: '2026-10-08T00:00:00Z', closed_at: '2026-10-09T00:00:00Z',
    entry_price: '100', exit_price: '101',
  };
  const rows = [
    { ...base, funding_fee_raw: '-0.04' },
    { ...base, funding_fee_raw: '-0.04' }, // Duplicate raw observation, not a second position.
    { ...base, position_id: 'position-2', funding_fee_raw: '0' },
    { ...base, position_id: 'position-3', funding_fee_raw: 'unknown' },
    { ...base, position_id: 'position-4', funding_fee_raw: null },
    { ...base, position_id: 'position-5', closed_at: '2026-10-16T00:00:00Z', funding_fee_raw: '7' },
  ];
  const pool = { query: async (sql: string) => ({ rows: sql.includes('v6_position_observations') ? rows : [] }) };
  const report = await historicalCostStressReport(pool as never, {
    trainBefore: '2026-09-30T00:00:00Z',
    testFrom: '2026-10-07T00:00:00Z',
    testBefore: '2026-10-15T00:00:00Z',
    embargoHours: 168,
  });
  assert.deepEqual(report.rawFundingFieldEvidence.map(x => [
    x.source, x.rawTestRows, x.fieldPresentRows, x.numericRows, x.nonzeroRows,
    x.verifiedSettlementPositions,
  ]), [
    ['kopyon', 5, 4, 3, 2, 0],
    ['okx', 0, 0, 0, 0, 0],
  ]);
  assert.equal(report.fundingCoverage[0].fundedPositions, 0);
  assert.equal(report.results[0].observedTestCostScenarios[0].averageNetReturnPct, null);
});
