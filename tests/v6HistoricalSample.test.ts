import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalCostStressReport } from '../src/research/v6HistoricalCostReport.js';

test('historical research queries are deterministically ordered and disclose truncation', async () => {
  const queries: string[] = [];
  const pool = { query: async (sql: string) => {
    queries.push(sql);
    return { rows: [] };
  } } as any;
  const report = await historicalCostStressReport(pool, {
    trainBefore: '2026-09-01T00:00:00Z',
    testFrom: '2026-09-08T00:00:00Z',
    testBefore: '2026-10-01T00:00:00Z',
    embargoHours: 168,
  });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(q => /ORDER BY[\s\S]*LIMIT 5001/.test(q)));
  assert.deepEqual(report.truncatedSources, { kopyon: false, okx: false });
  assert.equal(report.completeHistory, true);
});

test('5001st row marks source as truncated', async () => {
  let calls = 0;
  const pool = { query: async () => {
    calls++;
    return { rows: calls === 1 ? Array(5001).fill({ trader_id: '', position_id: '', symbol: '', side: '', opened_at: '', closed_at: '', entry_price: '', exit_price: '' }) : [] };
  } } as any;
  const report = await historicalCostStressReport(pool, {
    trainBefore: '2026-09-01T00:00:00Z',
    testFrom: '2026-09-08T00:00:00Z',
    testBefore: '2026-10-01T00:00:00Z',
    embargoHours: 168,
  });
  assert.equal(report.truncatedSources.kopyon, true);
  assert.equal(report.completeHistory, false);
  assert.equal(report.rowsRead.kopyon, 5000);
});
