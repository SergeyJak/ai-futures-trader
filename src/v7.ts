import type pg from 'pg';
import {ema} from './indicators.js';
export type V7Bar={time:number;open:number;high:number;low:number;close:number;volume:number};
export type V7Side='LONG'|'SHORT';
export type V7Position={side:V7Side;entry:number;entryAt:number;quantity:number;stop:number;best:number;atr:number};
export const V7_COST={fee:.0006,slippage:.0003} as const;
export function aggregateV7(minuteBars:V7Bar[]):V7Bar[]{
 const result:V7Bar[]=[];let bucket:V7Bar[]=[];
 for(const b of minuteBars){
  if(!Number.isFinite(b.time)||b.time%60000!==0||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high||b.volume<0)continue;
  const base=Math.floor(b.time/300000)*300000;
  if(bucket.length&&Math.floor(bucket[0].time/300000)*300000!==base){if(bucket.length===5&&bucket.every((x,i)=>x.time===baseOf(bucket[0])+i*60000))result.push(combine(bucket));bucket=[]}
  bucket.push(b);
 }
 if(bucket.length===5&&bucket.every((x,i)=>x.time===baseOf(bucket[0])+i*60000))result.push(combine(bucket));
 return result;
}
function baseOf(b:V7Bar){return Math.floor(b.time/300000)*300000}
function combine(b:V7Bar[]):V7Bar{return {time:baseOf(b[0]),open:b[0].open,high:Math.max(...b.map(x=>x.high)),low:Math.min(...b.map(x=>x.low)),close:b[4].close,volume:b.reduce((sum,x)=>sum+x.volume,0)}}
export function v7Atr(bars:V7Bar[],period=14):number|null{
 if(bars.length<period+1)return null;
 const x=bars.slice(-period).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[bars.length-period+i-1].close),Math.abs(b.low-bars[bars.length-period+i-1].close)));
 return x.reduce((a,b)=>a+b,0)/period;
}
export function v7Signal(bars:V7Bar[]):{side:V7Side;atr:number}|null{
 if(bars.length<31||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==300000))return null;
 const atr=v7Atr(bars);if(atr===null||atr<=0)return null;
 const previous=bars.at(-2)!,current=bars.at(-1)!;
 const history=bars.slice(-23,-3),avgVolume=history.reduce((s,b)=>s+b.volume,0)/history.length;
 if(avgVolume<=0||previous.volume<avgVolume*1.8||Math.abs(previous.close/previous.open-1)<.004)return null;
 const close=bars.map(b=>b.close),fast=ema(close,7),mid=ema(close,14),slow=ema(close,28);
 if(fast===null||mid===null||slow===null)return null;
 const bullish=previous.close>previous.open&&fast>mid&&mid>slow;
 const bearish=previous.close<previous.open&&fast<mid&&mid<slow;
 // Enter only on confirmed retrace and recovery; never chase the impulse close.
 if(bullish&&current.low<=previous.close-.25*atr&&current.close>current.open&&current.close>fast&&current.close<previous.high)return {side:'LONG',atr};
 if(bearish&&current.high>=previous.close+.25*atr&&current.close<current.open&&current.close<fast&&current.close>previous.low)return {side:'SHORT',atr};
 return null;
}
export function v7Exit(position:V7Position,bar:V7Bar):{price:number;reason:string;best:number;stop:number}|null{
 const long=position.side==='LONG',best=long?Math.max(position.best,bar.high):Math.min(position.best,bar.low);
 // Previous trailing stop applies for this bar: don't use its future high/low to tighten it retroactively.
 if(long?bar.low<=position.stop:bar.high>=position.stop)return {price:long?Math.min(bar.open,position.stop):Math.max(bar.open,position.stop),reason:'ATR_STOP',best,stop:position.stop};
 const stop=long?Math.max(position.stop,best-2*position.atr):Math.min(position.stop,best+2*position.atr);
 return {price:NaN,reason:'HOLD',best,stop};
}
export async function initV7(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v7_accounts(id INTEGER PRIMARY KEY CHECK(id=1),balance DOUBLE PRECISION NOT NULL DEFAULT 100,position JSONB,last_bar TIMESTAMPTZ)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v7_trades(id BIGSERIAL PRIMARY KEY,side TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price DOUBLE PRECISION NOT NULL,exit_price DOUBLE PRECISION NOT NULL,net_pnl DOUBLE PRECISION NOT NULL,reason TEXT NOT NULL)`);
 await pool.query('INSERT INTO v7_accounts(id) VALUES(1) ON CONFLICT DO NOTHING');
}
export async function tickV7(pool:pg.Pool){
 const client=await pool.connect();
 try{
 await client.query('BEGIN');
 const a=await client.query('SELECT balance,position,last_bar FROM v7_accounts WHERE id=1 FOR UPDATE');
 const r=await client.query(`SELECT start_at,open,high,low,close,volume FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true ORDER BY start_at DESC LIMIT 185`);
 const minutes:V7Bar[]=r.rows.reverse().map(b=>({time:new Date(b.start_at).getTime(),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume)}));
 const bars=aggregateV7(minutes),bar=bars.at(-1),last=a.rows[0]?.last_bar?new Date(a.rows[0].last_bar).getTime():null;
 if(!bar||bars.length<31||Date.now()-(bar.time+300000)>180000||last!==null&&bar.time<=last){await client.query('COMMIT');return}
 // Never pretend skipped intervals have been executed. Refresh cursor without inventing fills.
 if(last!==null&&bar.time-last>300000){await client.query("UPDATE v7_accounts SET last_bar=to_timestamp($1/1000.0),position=CASE WHEN position ? 'pendingAt' THEN NULL ELSE position END WHERE id=1",[bar.time]);await client.query('COMMIT');return}
 let balance=Number(a.rows[0].balance),position=a.rows[0].position as V7Position|null;
 if(position&&'pendingAt' in position){
  const pending=position as unknown as {pendingAt:number;side:V7Side;atr:number};
  if(bar.time===pending.pendingAt){
   const dir=pending.side==='LONG'?1:-1,entry=bar.open*(1+dir*V7_COST.slippage),stop=entry-dir*2*pending.atr;
   const quantity=Math.min(Math.max(0,balance)*.01/Math.abs(entry-stop),Math.max(0,balance)*.5/entry);
   position=quantity>0?{side:pending.side,entry,entryAt:bar.time,quantity,stop,best:entry,atr:pending.atr}:null;
  }else position=null;
 }else if(position){
  const action=v7Exit(position,bar);
  if(action?.reason==='ATR_STOP'){
   const dir=position.side==='LONG'?1:-1,exit=action.price*(1-dir*V7_COST.slippage);
   const net=position.quantity*dir*(exit-position.entry)-V7_COST.fee*position.quantity*(position.entry+exit);
   balance+=net;
   await client.query('INSERT INTO v7_trades(side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,to_timestamp($2/1000.0),to_timestamp($3/1000.0),$4,$5,$6,$7)',[position.side,position.entryAt,bar.time+300000,position.entry,exit,net,action.reason]);
   position=null;
  }else if(action){position={...position,best:action.best,stop:action.stop}}
 }else if(last!==null){
  const signal=v7Signal(bars);
  if(signal){
   // Queue a signal; only the following contiguous completed candle can provide an entry open.
   position={pendingAt:bar.time+300000,side:signal.side,atr:signal.atr} as unknown as V7Position;
  }
 }
 await client.query('UPDATE v7_accounts SET balance=$1,position=$2,last_bar=to_timestamp($3/1000.0) WHERE id=1',[balance,position?JSON.stringify(position):null,bar.time]);
 await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function v7Report(pool:pg.Pool){
 const [a,t]=await Promise.all([pool.query('SELECT balance,position,last_bar FROM v7_accounts WHERE id=1'),pool.query('SELECT id,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason FROM v7_trades ORDER BY id DESC LIMIT 100')]);
 const row=a.rows[0];return {mode:'forward-paper',symbol:'SOLUSDT',timeframe:'5m from confirmed 1m bars',realOrders:false,balance:Number(row.balance),position:row.position,lastBar:row.last_bar,trades:t.rows,feePerSide:V7_COST.fee,slippagePerSide:V7_COST.slippage,funding:'excluded',warning:'Research only. Signals are queued and filled from the next contiguous completed candle open; intrabar trailing stops use prior stop. Missing periods are skipped; no retroactive executions.'};
}
