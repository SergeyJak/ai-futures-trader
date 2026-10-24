import test from 'node:test';
import assert from 'node:assert/strict';
import { convertHistoricalCostRow } from '../src/research/v6HistoricalCostReport.js';

const base = {
  source: 'okx' as const, trader_id: 't', position_id: 'p', symbol: 'SOL-USDT-SWAP',
  side: 'long', opened_at: '2026-09-01T00:00:00Z', closed_at: '2026-09-02T00:00:00Z',
  entry_price: '100', exit_price: '102',
};

test('historical long and short price returns are direction aware', () => {
  assert.ok(Math.abs(convertHistoricalCostRow(base)!.grossReturnPct - 2) < 1e-9);
  assert.ok(Math.abs(convertHistoricalCostRow({ ...base, side: 'short' })!.grossReturnPct + 2) < 1e-9);
});

test('rejects non-closed and malformed historical records', () => {
  assert.equal(convertHistoricalCostRow({ ...base, closed_at: base.opened_at }), null);
  assert.equal(convertHistoricalCostRow({ ...base, side: 'net' }), null);
  assert.equal(convertHistoricalCostRow({ ...base, side: null }), null);
  assert.equal(convertHistoricalCostRow({ ...base, entry_price: '0' }), null);
  assert.equal(convertHistoricalCostRow({ ...base, closed_at: 'invalid' }), null);
});
