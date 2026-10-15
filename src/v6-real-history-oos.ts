import {okxSwapSymbolSql} from './v6-okx-symbol.js';
import {observedHoldingWindowStudy} from './v6-holding-window-study.js';
import type pg from 'pg';
import {classifyV6EntryPattern} from './v6-entry-study.js';
import {chronologicalHoldout,type CompletedTrade} from './v6-oos-backtest.js';
type RawRow={id:string;trader_id:string;symbol:string;side:string;opened_time:string;closed_time:string;entry_price:string;exit_price:string;status:string;entry_close:number|null;previous_minute:number|null;prior_close:number|null;entry_lag:number|null;prior_lag:number|null;minute_spacing:number|null};
export function convertV6ClosedRow(row:RawRow):CompletedTrade|null{
 const openedMs=Number(row.opened_time),closedMs=Number(row.closed_time),entry=Number(row.entry_price),exit=Number(row.exit_price);
 const side=/^(LONG|BUY)$/i.test(row.side)?'LONG':/^(SHORT|SELL)$/i.test(row.side)?'SHORT':null;
 if(!side||!/^[0-9]{13}$/.test(row.opened_time)||!/^[0-9]{13}$/.test(row.closed_time)||closedMs<=openedMs||!Number.isFinite(entry)||!Number.isFinite(exit)||entry<=0||exit<=0||/PARTIAL|OPEN|ACTIVE|PENDING/i.test(row.status))return null;
 if(row.entry_lag===null||row.prior_lag===null||row.minute_spacing!==60||row.entry_lag<0||row.entry_lag>180||row.prior_lag<0||row.prior_lag>180)return null;
 const pattern=classifyV6EntryPattern(side,row.entry_close,row.previous_minute,row.prior_close);
 if(!['dip_reversal','dip_continuation','momentum_continuation','momentum_pullback'].includes(pattern))return null;
 return {id:row.id,openedMs,closedMs,entry,exit,side,pattern:pattern as CompletedTrade['pattern']};
}
/** Historical trader execution study, not a strategy replay or executable entry signal. */
export async function studyV6OutOfSample(pool:pg.Pool){
 const result=await pool.query<RawRow>(`SELECT
 concat(o.trader_id,'|',o.raw->>'symbol','|',o.raw->>'side','|',o.raw->>'opened_time','|',o.raw->>'closed_time') AS id,
 o.trader_id,o.raw->>'symbol' AS symbol,o.raw->>'side' AS side,
 o.raw->>'opened_time' AS opened_time,o.raw->>'closed_time' AS closed_time,
 o.raw->>'avg_entry_price' AS entry_price,o.raw->>'avg_close_price' AS exit_price,
 COALESCE(o.raw->>'status','') AS status,
 e.close::float8 AS entry_close,m.close::float8 AS previous_minute,p.close::float8 AS prior_close,
 EXTRACT(EPOCH FROM (t.opened_at-(e.start_at+interval '1 minute')))::float8 AS entry_lag,
 EXTRACT(EPOCH FROM (t.opened_at-interval '15 minutes'-(p.start_at+interval '1 minute')))::float8 AS prior_lag,
 EXTRACT(EPOCH FROM (e.start_at-m.start_at))::float8 AS minute_spacing
 FROM (
  SELECT DISTINCT ON (trader_id,raw->>'symbol',raw->>'side',raw->>'opened_time',raw->>'closed_time') trader_id,raw,id
  FROM v6_position_observations WHERE kind='history'
  AND raw->>'opened_time' ~ '^[0-9]{13}$'
  AND raw->>'closed_time' ~ '^[0-9]{13}$'
  AND UPPER(COALESCE(raw->>'status','')) !~ 'PARTIAL|OPEN|ACTIVE|PENDING'
  ORDER BY trader_id,raw->>'symbol',raw->>'side',raw->>'opened_time',raw->>'closed_time',id DESC
 ) o
 CROSS JOIN LATERAL (SELECT to_timestamp((o.raw->>'opened_time')::float8/1000) opened_at) t
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at+interval '1 minute'<=t.opened_at ORDER BY start_at DESC LIMIT 1) e ON true
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at+interval '1 minute'<=t.opened_at-interval '15 minutes' ORDER BY start_at DESC LIMIT 1) p ON true
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at=e.start_at-interval '1 minute' LIMIT 1) m ON true
 ORDER BY t.opened_at ASC LIMIT 5000`);
 const okx=await pool.query<RawRow>(`SELECT
 concat('okx:',h.unique_code,'|',h.sub_pos_id) AS id,
 concat('okx:',h.unique_code) AS trader_id,
 inst.symbol AS symbol,
 upper(COALESCE(h.raw->>'posSide','')) AS side,
 (EXTRACT(EPOCH FROM h.open_at)*1000)::bigint::text AS opened_time,
 (EXTRACT(EPOCH FROM h.close_at)*1000)::bigint::text AS closed_time,
 h.raw->>'openAvgPx' AS entry_price,h.raw->>'closeAvgPx' AS exit_price,
 'CLOSED' AS status,
 e.close::float8 AS entry_close,m.close::float8 AS previous_minute,p.close::float8 AS prior_close,
 EXTRACT(EPOCH FROM (h.open_at-(e.start_at+interval '1 minute')))::float8 AS entry_lag,
 EXTRACT(EPOCH FROM (h.open_at-interval '15 minutes'-(p.start_at+interval '1 minute')))::float8 AS prior_lag,
 EXTRACT(EPOCH FROM (e.start_at-m.start_at))::float8 AS minute_spacing
 FROM v6_okx_history h
 CROSS JOIN LATERAL (SELECT ${okxSwapSymbolSql('h.raw')} AS symbol) inst
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=inst.symbol AND confirmed=true AND start_at+interval '1 minute'<=h.open_at ORDER BY start_at DESC LIMIT 1) e ON true
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=inst.symbol AND confirmed=true AND start_at+interval '1 minute'<=h.open_at-interval '15 minutes' ORDER BY start_at DESC LIMIT 1) p ON true
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=inst.symbol AND confirmed=true AND start_at=e.start_at-interval '1 minute' LIMIT 1) m ON true
 ORDER BY h.open_at ASC LIMIT 5000`);
 const kopyonClosed=result.rows.map(convertV6ClosedRow).filter((x):x is CompletedTrade=>x!==null);
 const okxClosed=okx.rows.map(convertV6ClosedRow).filter((x):x is CompletedTrade=>x!==null);
 const converted=[...kopyonClosed,...okxClosed];
 const total=result.rows.length+okx.rows.length;
 return {closedHistoryRows:total,sourceCounts:{kopyon:result.rows.length,okx:okx.rows.length},
  eligibleWithCompleteCandlesAndPrices:converted.length,excluded:total-converted.length,
  sourceAssessments:{
   kopyon:{closedHistoryRows:result.rows.length,eligible:kopyonClosed.length,excluded:result.rows.length-kopyonClosed.length,assessment:chronologicalHoldout(kopyonClosed)},
   okx:{closedHistoryRows:okx.rows.length,eligible:okxClosed.length,excluded:okx.rows.length-okxClosed.length,assessment:chronologicalHoldout(okxClosed)}
  },
  assessment:chronologicalHoldout(converted),holdingWindows:observedHoldingWindowStudy(converted),
  scope:'Historical observed trader fills only, not executable entry signals. Pooled assessment mixes providers; evaluate each source separately. Missing candles and unsupported non-USDT instruments are excluded. Funding and market impact are not modeled.'};
}
