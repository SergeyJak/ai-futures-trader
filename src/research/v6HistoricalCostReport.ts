import type pg from 'pg';
import { deduplicateClosedPositions, stressBySource, type ClosedPosition } from './v6CostStress.js';
import { groupFrozenOosBySource, type FrozenSplit } from './v6FrozenOos.js';

type SourceRow = { source: 'kopyon' | 'okx'; trader_id: string; position_id: string; symbol: string; side: string; opened_at: string; closed_at: string; entry_price: string; exit_price: string };
const validTime = (value: string) => Number.isFinite(Date.parse(value));

export function convertHistoricalCostRow(row: SourceRow): ClosedPosition | null {
  const entry = Number(row.entry_price), exit = Number(row.exit_price);
  const side = row.side.toUpperCase();
  if (!row.trader_id || !row.position_id || !row.symbol || !validTime(row.opened_at) || !validTime(row.closed_at)
    || Date.parse(row.closed_at) <= Date.parse(row.opened_at)
    || !Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0 || exit <= 0
    || !['LONG', 'SHORT', 'BUY', 'SELL'].includes(side)) return null;
  const direction = side === 'LONG' || side === 'BUY' ? 1 : -1;
  return { source: row.source, traderId: row.trader_id, positionId: row.position_id,
    symbol: row.symbol, closedAt: row.closed_at,
    grossReturnPct: 100 * direction * (exit / entry - 1) };
}

/** Observed historical fills, not reproducible trading signals. Funding unavailable. */
export async function historicalCostStressReport(pool: pg.Pool, split: FrozenSplit) {
  const [kopyon, okx] = await Promise.all([
    pool.query<SourceRow>(`SELECT 'kopyon' AS source, trader_id,
      concat(trader_id,'|',raw->>'symbol','|',raw->>'side','|',raw->>'opened_time','|',raw->>'closed_time') AS position_id,
      raw->>'symbol' AS symbol,raw->>'side' AS side,
      to_timestamp((raw->>'opened_time')::float8/1000)::text AS opened_at,
      to_timestamp((raw->>'closed_time')::float8/1000)::text AS closed_at,
      raw->>'avg_entry_price' AS entry_price,raw->>'avg_close_price' AS exit_price
      FROM v6_position_observations WHERE kind='history'
      AND raw->>'opened_time' ~ '^[0-9]{13}$' AND raw->>'closed_time' ~ '^[0-9]{13}$'
      AND upper(coalesce(raw->>'status','')) !~ 'PARTIAL|OPEN|ACTIVE|PENDING'
      ORDER BY (raw->>'closed_time')::bigint DESC, trader_id ASC, (raw->>'opened_time')::bigint DESC
      LIMIT 5001`),
    pool.query<SourceRow>(`SELECT 'okx' AS source,concat('okx:',unique_code) AS trader_id,
      sub_pos_id AS position_id,raw->>'instId' AS symbol,
      raw->>'posSide' AS side,open_at::text AS opened_at,close_at::text AS closed_at,
      raw->>'openAvgPx' AS entry_price,raw->>'closeAvgPx' AS exit_price
      FROM v6_okx_history ORDER BY close_at DESC, unique_code ASC, sub_pos_id ASC LIMIT 5001`),
  ]);
  const truncatedSources = { kopyon: kopyon.rows.length > 5000, okx: okx.rows.length > 5000 };
  const all = [...kopyon.rows.slice(0,5000), ...okx.rows.slice(0,5000)];
  const eligible = deduplicateClosedPositions(all.map(convertHistoricalCostRow).filter((p): p is ClosedPosition => p !== null));
  const cohorts = groupFrozenOosBySource(eligible, split);
  return {
    mode: 'observed-historical-fills-only',
    realOrders: false,
    rowsRead: { kopyon: Math.min(kopyon.rows.length,5000), okx: Math.min(okx.rows.length,5000) },
    truncatedSources,
    completeHistory: !truncatedSources.kopyon && !truncatedSources.okx,
    eligibleClosed: { kopyon: eligible.filter(p => p.source === 'kopyon').length, okx: eligible.filter(p => p.source === 'okx').length },
    excludedOrDuplicate: all.length - eligible.length,
    frozenSplit: split,
    results: (['kopyon', 'okx'] as const).map(source => ({
      source,
      trainCount: cohorts[source].train.length,
      embargoCount: cohorts[source].embargo,
      testCount: cohorts[source].test.length,
      outsideCount: cohorts[source].outside,
      observedTestCostScenarios: stressBySource(cohorts[source].test).find(r => r.source === source)!.scenarios,
    })),
    warning: 'Historical trader fills only. Latest 5000 rows per source; truncated sources do not represent complete history. Funding unavailable; net returns remain null. Not a strategy backtest or evidence of profitability.',
  };
}
