import type pg from 'pg';
import {evaluateEntryFilters,priorCandleFeatures,ENTRY_FILTER_CANDIDATES,type EntryObservation} from './entry-filter-oos.js';
type Version='v3'|'v4';
export async function evaluateStoredEntryFilters(pool:pg.Pool,version:Version,cutoff:string,minTest=30){
 if(!Number.isFinite(Date.parse(cutoff)))throw Error('Invalid cutoff');
 const table=version==='v3'?'v3_trades':'v4_trades';
 // Limit the lookback to entries in the requested study; exclude entries without full confirmed history.
 const trades=await pool.query(`SELECT config_id,symbol,side,entry_at::text AS at,pnl::float8 AS net
 FROM ${table} WHERE entry_at >= $1::timestamptz - interval '30 days' AND entry_at < $1::timestamptz + interval '7 days'
 ORDER BY entry_at,config_id,id LIMIT 20001`,[cutoff]);
 if(trades.rows.length>20000)throw Error('OOS sample exceeds 20000 rows; use a smaller fixed window or paginated study');
 const rows:EntryObservation[]=[];let missingHistory=0;
 for(const t of trades.rows){
  const candles=await pool.query(`SELECT open::float8,high::float8,low::float8,close::float8,start_at::text AS at
   FROM market_candles WHERE symbol=$1 AND confirmed=true AND start_at<$2::timestamptz
   ORDER BY start_at DESC LIMIT 30`,[t.symbol,t.at]);
  const prior=candles.rows.reverse();
  const entryMs=Date.parse(t.at);
  if(prior.length!==30||prior.some((c,i)=>Date.parse(c.at)!==entryMs-(30-i)*60000)){missingHistory++;continue}
  rows.push({at:t.at,symbol:t.symbol,side:t.side,net:Number(t.net),features:priorCandleFeatures(prior)});
 }
 return {version,cutoff,studyStart:new Date(Date.parse(cutoff)-30*86400000).toISOString(),studyEnd:new Date(Date.parse(cutoff)+7*86400000).toISOString(),loadedTrades:trades.rows.length,usableTrades:rows.length,missingHistory,
  // A fixed cutoff is specified by the caller. Never rank or tune candidates on test results.
  scores:evaluateEntryFilters(rows,ENTRY_FILTER_CANDIDATES,cutoff,minTest)};
}
