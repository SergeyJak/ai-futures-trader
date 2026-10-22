import type pg from 'pg';
import {exitDecision,confirmedCandleCloseTime} from './sol-dip-paper.js';
export const SOL_5M_VARIANTS=[...(['LONG','SHORT'] as const).flatMap(side=>[{id:side+'-30m',side,minutes:30},{id:side+'-4h',side,minutes:240},{id:side+'-unlimited',side,minutes:null}])] as const;
type Bar={time:number;open:number;high:number;low:number;close:number};
const fee=.0006,slip=.0003;
export function aggregateConfirmed5m(bars:Bar[]):Bar[]{
 const groups=new Map<number,Bar[]>();
 for(const b of bars){const bucket=Math.floor(b.time/300000)*300000;groups.set(bucket,[...(groups.get(bucket)??[]),b])}
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).flatMap(([time,items])=>{items.sort((a,b)=>a.time-b.time);return items.length===5&&items.every((b,i)=>b.time===time+i*60000)?[{time,open:items[0].open,high:Math.max(...items.map(b=>b.high)),low:Math.min(...items.map(b=>b.low)),close:items[4].close}]:[]});
}
export function sol5mReversalSignal(bars:Bar[]):'LONG'|'SHORT'|null{
 if(bars.length<4)return null;const b=bars.slice(-4);
 if(b.some((x,i)=>i>0&&x.time-b[i-1].time!==300000))return null;
 if(b[2].close/b[0].close<=.995&&b[3].close>b[2].close)return 'LONG';
 if(b[2].close/b[0].close>=1.005&&b[3].close<b[2].close)return 'SHORT';
 return null;
}
export async function initSol5m(pool:pg.Pool){
 await pool.query('CREATE TABLE IF NOT EXISTS sol_5m_accounts(id TEXT PRIMARY KEY,balance DOUBLE PRECISION NOT NULL DEFAULT 100,position JSONB,last_bar TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await pool.query('CREATE TABLE IF NOT EXISTS sol_5m_trades(id BIGSERIAL PRIMARY KEY,variant TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price DOUBLE PRECISION NOT NULL,exit_price DOUBLE PRECISION NOT NULL,net_pnl DOUBLE PRECISION NOT NULL,reason TEXT NOT NULL)');
 for(const v of SOL_5M_VARIANTS)await pool.query('INSERT INTO sol_5m_accounts(id) VALUES($1) ON CONFLICT DO NOTHING',[v.id]);
}
export async function tickSol5m(pool:pg.Pool){
 const client=await pool.connect();
 try{await client.query('BEGIN');
 const r=await client.query("SELECT start_at,open,high,low,close FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true ORDER BY start_at DESC LIMIT 26");
 const bars:Bar[]=r.rows.reverse().map(x=>({time:new Date(x.start_at).getTime(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 const bar=bars.at(-1);
 if(!bar||Date.now()-bar.time>180000||bars.length<21||bars.some((x,i)=>i>0&&x.time-bars[i-1].time!==60000)||bars.some(x=>![x.open,x.high,x.low,x.close].every(n=>Number.isFinite(n)&&n>0))){await client.query('COMMIT');return}
 // A 5m signal is observable only after its fifth 1m candle closes.
 const confirmed5m=aggregateConfirmed5m(bars.filter(b=>b.time+60000<=bar.time+60000));
 const latest=confirmed5m.at(-1);
 const signal=latest&&latest.time+300000===bar.time+60000?sol5mReversalSignal(confirmed5m):null;
 for(const variant of SOL_5M_VARIANTS){
  const q=await client.query('SELECT balance,position,last_bar FROM sol_5m_accounts WHERE id=$1 FOR UPDATE',[variant.id]);const row=q.rows[0];
  if(row.last_bar&&new Date(row.last_bar).getTime()>=bar.time)continue;
  if(!row.last_bar||bar.time-new Date(row.last_bar).getTime()>120000){
   await client.query("UPDATE sol_5m_accounts SET last_bar=to_timestamp($2/1000.0),position=CASE WHEN position ? 'pendingAt' THEN NULL ELSE position END WHERE id=$1",[variant.id,bar.time]);continue;
  }
  let balance=Number(row.balance),position=row.position as {entry:number;entryAt:number;quantity:number;pendingAt?:number}|null;
  if(position?.pendingAt){
   // Signal was confirmed at the previous minute close. Enter at the next
   // minute open, then evaluate that minute's full stop/take range.
   position=position.pendingAt===bar.time?openSol5mPosition(variant.side,bar,balance):null;
  }
  if(position&&!position.pendingAt){
   if(confirmedCandleCloseTime(bar.time)>position.entryAt){
    const decision=variant.side==='LONG'?exitDecision(position,bar,variant.minutes):shortExit(position,bar,variant.minutes);
    if(decision){const exitPrice=decision.price*(variant.side==='LONG'?1-slip:1+slip);const pnl=position.quantity*(variant.side==='LONG'?exitPrice-position.entry:position.entry-exitPrice)-fee*position.quantity*(position.entry+exitPrice);balance+=pnl;
     await client.query('INSERT INTO sol_5m_trades(variant,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,to_timestamp($2/1000.0),to_timestamp($3/1000.0),$4,$5,$6,$7)',[variant.id,position.entryAt,confirmedCandleCloseTime(bar.time),position.entry,exitPrice,pnl,decision.reason]);position=null}
   }
  }else if(!position&&signal===variant.side)position={pendingAt:bar.time+60000,entry:0,entryAt:0,quantity:0};
  await client.query('UPDATE sol_5m_accounts SET balance=$2,position=$3,last_bar=to_timestamp($4/1000.0) WHERE id=$1',[variant.id,balance,position?JSON.stringify(position):null,bar.time]);
 }
 await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export function openSol5mPosition(side:'LONG'|'SHORT',bar:Bar,balance:number){
 const entry=bar.open*(side==='LONG'?1+slip:1-slip);
 return {entry,entryAt:bar.time,quantity:Math.max(0,balance)*.1/entry};
}
export function shortExit(p:{entry:number;entryAt:number},b:Bar,minutes:number|null){
 if(b.high>=p.entry*1.01)return {reason:'STOP',price:Math.max(b.close,p.entry*1.01)};
 if(b.low<=p.entry*.98)return {reason:'TAKE',price:p.entry*.98};
 if(minutes!==null&&confirmedCandleCloseTime(b.time)-p.entryAt>=minutes*60000)return {reason:'TIME',price:b.close};
 return null;
}
export async function sol5mReport(pool:pg.Pool){
 const [accounts,trades,totals]=await Promise.all([
 pool.query('SELECT id,balance,position,last_bar FROM sol_5m_accounts ORDER BY id'),
 pool.query('SELECT id,variant,entry_at,exit_at,entry_price,exit_price,net_pnl,reason FROM sol_5m_trades ORDER BY id DESC LIMIT 90'),
 pool.query('SELECT variant,COUNT(*)::int AS closed,COALESCE(SUM(net_pnl),0)::double precision AS net,COUNT(*) FILTER(WHERE net_pnl>0)::int AS wins FROM sol_5m_trades GROUP BY variant')]);
 return {symbol:'SOLUSDT',signalTimeframe:'5m',executionTimeframe:'1m',mode:'forward-paper-only',realOrders:false,feeRate:fee,slippageRate:slip,variants:SOL_5M_VARIANTS.map(v=>({...v,...accounts.rows.find(a=>a.id===v.id),closedTrades:totals.rows.find(t=>t.variant===v.id)?.closed??0,realizedNetPnl:totals.rows.find(t=>t.variant===v.id)?.net??0,wins:totals.rows.find(t=>t.variant===v.id)?.wins??0,trades:trades.rows.filter(t=>t.variant===v.id)}))};
}
