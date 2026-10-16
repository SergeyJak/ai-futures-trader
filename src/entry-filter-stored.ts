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
 // One bounded candle scan per symbol, not one query per trade.
 const candleIndex=new Map<string,Map<number,{open:number;high:number;low:number;close:number}>>();
 for(const symbol of [...new Set(trades.rows.map(t=>String(t.symbol)))]){
  const q=await pool.query(`SELECT start_at::text AS at,open::float8,high::float8,low::float8,close::float8
   FROM market_candles WHERE symbol=$1 AND confirmed=true
   AND start_at >= $2::timestamptz - interval '30 minutes'
   AND start_at < $3::timestamptz ORDER BY start_at`,
   [symbol,new Date(Date.parse(cutoff)-30*86400000).toISOString(),new Date(Date.parse(cutoff)+7*86400000).toISOString()]);
  candleIndex.set(symbol,new Map(q.rows.map(c=>[Date.parse(c.at),c])));
 }
 for(const t of trades.rows){
  const entryMs=Date.parse(t.at),index=candleIndex.get(t.symbol);
  const prior=Array.from({length:30},(_,i)=>index?.get(entryMs-(30-i)*60000));
  if(prior.some(c=>!c)){missingHistory++;continue}
  rows.push({at:t.at,symbol:t.symbol,side:t.side,net:Number(t.net),features:priorCandleFeatures(prior as {open:number;high:number;low:number;close:number}[])});
 }
 return {version,cutoff,studyStart:new Date(Date.parse(cutoff)-30*86400000).toISOString(),studyEnd:new Date(Date.parse(cutoff)+7*86400000).toISOString(),loadedTrades:trades.rows.length,usableTrades:rows.length,missingHistory,
  // A fixed cutoff is specified by the caller. Never rank or tune candidates on test results.
  scores:evaluateEntryFilters(rows,ENTRY_FILTER_CANDIDATES,cutoff,minTest)};
}
