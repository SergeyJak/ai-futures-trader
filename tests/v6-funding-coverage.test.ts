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
