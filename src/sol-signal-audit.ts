import type pg from 'pg';
/** Read-only reconciliation of the live SOL dip signal against confirmed 1m candles. */
export async function auditSolSignals(pool:pg.Pool){
 const q=await pool.query(`
 WITH candles AS (
  SELECT start_at,close::double precision AS c,
   lag(close::double precision,1) OVER (ORDER BY start_at) AS c1,
   lag(close::double precision,3) OVER (ORDER BY start_at) AS c3,
   lag(start_at,3) OVER (ORDER BY start_at) AS t3
  FROM market_candles
  WHERE symbol='SOLUSDT' AND confirmed=true AND start_at>=now()-interval '8 days'
 ), expected AS (
  SELECT start_at,(c1/c3<=0.995 AND c>c1) AS signal
  FROM candles
  WHERE start_at>=now()-interval '7 days' AND t3=start_at-interval '3 minutes'
 ), recorded AS (
  SELECT bar_time,signal FROM sol_dip_signal_audit
  WHERE bar_time>=now()-interval '7 days'
 )
 SELECT (SELECT count(*)::int FROM expected) AS valid_candles,
 (SELECT count(*)::int FROM expected WHERE signal) AS expected_signals,
 (SELECT count(*)::int FROM recorded) AS audited_candles,
 (SELECT count(*)::int FROM recorded WHERE signal) AS recorded_signals,
 (SELECT count(*)::int FROM expected e LEFT JOIN recorded r ON r.bar_time=e.start_at WHERE r.bar_time IS NULL) AS missing_audit,
 (SELECT count(*)::int FROM expected e JOIN recorded r ON r.bar_time=e.start_at WHERE e.signal IS DISTINCT FROM r.signal) AS mismatched_signals,
 (SELECT max(start_at) FROM expected) AS last_confirmed,
 (SELECT max(bar_time) FROM recorded) AS last_audited,
 (SELECT count(*)::int FROM sol_dip_trades WHERE entry_at>=now()-interval '7 days') AS closed_trades
 `);
 const x=q.rows[0];return {period:'last 7 days',symbol:'SOLUSDT',...x,
  note:'Historical signals include periods before the paper experiment began. Signals during open positions do not imply additional entries. This is a read-only audit.'};
}
