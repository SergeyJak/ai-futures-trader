import type pg from 'pg';
import {fetchHistory,MINUTE} from './backfill.js';
import type {Candle} from './candles.js';
export type V6BackfillTarget={symbol:string;openedMs:number};
const retryAfter=new Map<string,number>();
/** Select at most one window per symbol, prioritizing recent closed positions. */
export function selectV6BackfillTargets(rows:V6BackfillTarget[],nowMs:number,max=2,blocked:ReadonlySet<string>=new Set()):V6BackfillTarget[]{
 const seen=new Set<string>();const result:V6BackfillTarget[]=[];
 for(const row of [...rows].sort((a,b)=>b.openedMs-a.openedMs)){
  const symbol=String(row.symbol??'').toUpperCase(),time=Number(row.openedMs);
  if(!/^[A-Z0-9]{2,20}USD(?:T|C)$/.test(symbol)||!Number.isSafeInteger(time)||time<=0||time>nowMs-20*MINUTE||time<nowMs-90*86400000||seen.has(symbol)||blocked.has(symbol))continue;
  seen.add(symbol);result.push({symbol,openedMs:time});
  if(result.length>=max)break;
 }
 return result;
}
export function v6BackfillCooldownMs(error:unknown):number{
 const msg=String(error);
 return /Symbol Is Invalid|invalid symbol|symbol not found/i.test(msg)?24*3600000:60*60000;
}
export async function backfillV6EntryCandles(pool:pg.Pool,save:(c:Candle)=>Promise<unknown>,nowMs=Date.now()){
 // Bound the candidate scan by recent observation ID before checking candles.
 // Distinct symbols prevent a delisted market monopolizing both request slots.
 const q=await pool.query(`WITH recent AS (
  SELECT raw->>'symbol' AS symbol,(raw->>'opened_time')::bigint AS opened_ms
  FROM (SELECT raw FROM v6_position_observations
    WHERE kind='history' AND raw->>'opened_time' ~ '^[0-9]{13}$'
    AND raw->>'closed_time' ~ '^[0-9]{13}$'
    AND UPPER(COALESCE(raw->>'status','')) !~ 'PARTIAL|OPEN|ACTIVE|PENDING'
    ORDER BY id DESC LIMIT 1500) h
 ), missing AS (
  SELECT r.symbol,r.opened_ms FROM recent r
  WHERE NOT EXISTS(
    SELECT 1 FROM market_candles e
    JOIN market_candles m ON m.symbol=e.symbol AND m.confirmed=true AND m.start_at=e.start_at-interval '1 minute'
    JOIN market_candles p ON p.symbol=e.symbol AND p.confirmed=true
      AND p.start_at=date_trunc('minute',to_timestamp(r.opened_ms::float8/1000))-interval '16 minutes'
    WHERE e.symbol=r.symbol AND e.confirmed=true
      AND e.start_at=date_trunc('minute',to_timestamp(r.opened_ms::float8/1000))-interval '1 minute'
  )
 )
 SELECT symbol,opened_ms FROM (
  SELECT DISTINCT ON (symbol) symbol,opened_ms FROM missing
  ORDER BY symbol,opened_ms DESC
 ) newest_per_symbol
 ORDER BY opened_ms DESC LIMIT 150`);
 for(const [symbol,until] of retryAfter)if(until<=nowMs)retryAfter.delete(symbol);
 const blocked=new Set(retryAfter.keys());
 const targets=selectV6BackfillTargets(q.rows.map(r=>({symbol:r.symbol,openedMs:Number(r.opened_ms)})),nowMs,2,blocked);
 let saved=0;const errors:string[]=[];
 for(const t of targets){
  const end=Math.floor(t.openedMs/MINUTE)*MINUTE-MINUTE;
  const start=end-20*MINUTE;
  try{
   const candles=await fetchHistory(t.symbol,start,end);
   if(!candles.length){retryAfter.set(t.symbol,nowMs+60*60000);errors.push(t.symbol+': no historical candles');continue}
   for(const candle of candles){await save(candle);saved++}
  }catch(e){retryAfter.set(t.symbol,nowMs+v6BackfillCooldownMs(e));errors.push(t.symbol+': '+String(e).slice(0,100))}
 }
 return {targets:targets.map(t=>t.symbol),saved,errors,skippedCooldown:blocked.size,mode:'research-only' as const};
}

/** Report actual candle coverage progress rather than a misleading unconditional 'completed'. */
export function summarizeV6Backfill(result:{targets:string[];saved:number;errors:string[];skippedCooldown:number}){
 const status=result.errors.length?'partial':result.targets.length?'completed':'idle';
 return {status,targets:result.targets.length,saved:result.saved,failed:result.errors.length,skippedCooldown:result.skippedCooldown,errors:result.errors.slice(0,2)};
}
