import type pg from 'pg';
import {fetchHistory,MINUTE} from './backfill.js';
import type {Candle} from './candles.js';
import {MIN_PAUSE_MS} from './v6-request-policy.js';
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
 if(/Symbol Is Invalid|invalid symbol|symbol not found/i.test(msg))return 24*3600000;
 // Backfill shares the Bybit quota with other research. Respect the same
 // conservative minimum pause used by the V6 provider request policy.
 if(/\b429\b|rate[ -]?limit|too many requests/i.test(msg))return MIN_PAUSE_MS;
 return 60*60000;
}
/** A backfill window is complete only when every confirmed minute is present. */
export function v6MissingEntryMinutes(candles:readonly Candle[],symbol:string,startMs:number,endMs:number):number{
 const present=new Set(candles.filter(c=>c.symbol===symbol&&c.confirmed&&Number.isSafeInteger(c.startMs)&&c.startMs%MINUTE===0&&c.startMs>=startMs&&c.startMs<=endMs).map(c=>c.startMs));
 let missing=0;
 for(let t=startMs;t<=endMs;t+=MINUTE)if(!present.has(t))missing++;
 return missing;
}
export async function backfillV6EntryCandles(pool:pg.Pool,save:(c:Candle)=>Promise<unknown>,nowMs=Date.now(),load:typeof fetchHistory=fetchHistory){
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
    WHERE e.symbol=r.symbol AND e.confirmed=true
      AND e.start_at BETWEEN
        date_trunc('minute',to_timestamp(r.opened_ms::float8/1000))-interval '21 minutes'
        AND date_trunc('minute',to_timestamp(r.opened_ms::float8/1000))-interval '1 minute'
    GROUP BY e.symbol HAVING COUNT(DISTINCT e.start_at)=21
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
   const candles=await load(t.symbol,start,end);
   // Empty historical windows frequently belong to delisted/unavailable markets.
   // Avoid retrying the same empty window every hour, but keep it eligible later.
   if(!candles.length){retryAfter.set(t.symbol,nowMs+6*3600000);errors.push(t.symbol+': no historical candles');continue}
   for(const candle of candles){await save(candle);saved++}
   const missing=v6MissingEntryMinutes(candles,t.symbol,start,end);
   if(missing){
    // The provider may return only the missing subset. Verify the union of
    // existing and newly saved confirmed candles before declaring a gap.
    const coverage=await pool.query(`SELECT COUNT(DISTINCT start_at)::int AS confirmed_minutes
      FROM market_candles WHERE symbol=$1 AND confirmed=true
      AND start_at BETWEEN to_timestamp($2::float8/1000) AND to_timestamp($3::float8/1000)`,[t.symbol,start,end]);
    const confirmed=Number(coverage.rows[0]?.confirmed_minutes??0);
    if(confirmed!==21){
     retryAfter.set(t.symbol,nowMs+60*60000);
     errors.push(t.symbol+': incomplete entry window ('+Math.max(0,21-confirmed)+' missing confirmed minutes)');
    }
   }
  }catch(e){retryAfter.set(t.symbol,nowMs+v6BackfillCooldownMs(e));errors.push(t.symbol+': '+String(e).slice(0,100))}
 }
 return {targets:targets.map(t=>t.symbol),saved,errors,skippedCooldown:blocked.size,mode:'research-only' as const};
}
