import type pg from 'pg';
import {fetchHistory,MINUTE} from './backfill.js';
import type {Candle} from './candles.js';
export type V6BackfillTarget={symbol:string;openedMs:number};
/** Select only closed history with missing entry candles, never open-position snapshots. */
export function selectV6BackfillTargets(rows:V6BackfillTarget[],nowMs:number,max=2):V6BackfillTarget[]{
 const seen=new Set<string>();const result:V6BackfillTarget[]=[];
 for(const row of rows){
  const symbol=String(row.symbol??'').toUpperCase(),time=Number(row.openedMs);
  if(!/^[A-Z0-9]{2,20}USDT$/.test(symbol)||!Number.isSafeInteger(time)||time<=0||time>nowMs-20*MINUTE||time<nowMs-90*86400000)continue;
  const key=symbol+':'+Math.floor(time/3600000);
  if(seen.has(key))continue;seen.add(key);result.push({symbol,openedMs:time});
  if(result.length>=max)break;
 }
 return result;
}
export async function backfillV6EntryCandles(pool:pg.Pool,save:(c:Candle)=>Promise<unknown>,nowMs=Date.now()){
 const q=await pool.query(`SELECT DISTINCT ON (o.raw->>'symbol',o.raw->>'opened_time')
 o.raw->>'symbol' AS symbol,(o.raw->>'opened_time')::bigint AS opened_ms
 FROM v6_position_observations o
 WHERE o.kind='history' AND o.raw->>'opened_time' ~ '^[0-9]{13}$'
 AND o.raw->>'closed_time' ~ '^[0-9]{13}$'
 AND UPPER(COALESCE(o.raw->>'status','')) !~ 'PARTIAL|OPEN|ACTIVE|PENDING'
 AND NOT EXISTS(SELECT 1 FROM market_candles c WHERE c.symbol=o.raw->>'symbol'
 AND c.confirmed=true AND c.start_at=date_trunc('minute',to_timestamp((o.raw->>'opened_time')::float8/1000))-interval '1 minute')
 ORDER BY o.raw->>'symbol',o.raw->>'opened_time' DESC LIMIT 100`);
 const targets=selectV6BackfillTargets(q.rows.map(r=>({symbol:r.symbol,openedMs:Number(r.opened_ms)})),nowMs);
 let saved=0;const errors:string[]=[];
 for(const t of targets){
  const end=Math.floor(t.openedMs/MINUTE)*MINUTE-MINUTE;
  const start=end-20*MINUTE;
  try{
   const candles=await fetchHistory(t.symbol,start,end);
   for(const candle of candles){await save(candle);saved++}
  }catch(e){errors.push(t.symbol+': '+String(e).slice(0,100))}
 }
 return {targets:targets.map(t=>t.symbol),saved,errors,mode:'research-only' as const};
}
