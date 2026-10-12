import type pg from 'pg';
import {STRATEGY_PAGES,type StrategyKey} from './strategy-pages.js';
export const EXPERIMENT_KEYS=Object.keys(STRATEGY_PAGES) as StrategyKey[];
export const EXIT_MODES=[{id:'30m',minutes:30},{id:'4h',minutes:240},{id:'bracket',minutes:null}] as const;
export const FEE=.0006,SLIP=.0003,STOP=.01,TAKE=.02;
type Bar={time:number;open:number;high:number;low:number;close:number};
type Position={entry:number;entryAt:number;quantity:number;side:'LONG'|'SHORT'};
export function strategySignal(key:StrategyKey,bars:Bar[]):'LONG'|'SHORT'|null{
 if(bars.length<16)return null;
 const last=bars.at(-1)!,prev=bars.at(-2)!,first=bars.at(-16)!;
 if(![last.close,prev.close,first.close].every(x=>Number.isFinite(x)&&x>0))return null;
 const move=last.close/first.close-1,minute=last.close/prev.close-1;
 if(key==='dip_reversal')return move<=-.005&&minute>0?'LONG':move>=.005&&minute<0?'SHORT':null;
 if(key==='momentum_continuation')return move>=.005&&minute>0?'LONG':move<=-.005&&minute<0?'SHORT':null;
 return move<=-.005&&minute<0?'LONG':move>=.005&&minute>0?'SHORT':null;
}
export function strategyExit(p:Position,b:Bar,minutes:number|null){
 const dir=p.side==='LONG'?1:-1,stop=p.entry*(1-dir*STOP),take=p.entry*(1+dir*TAKE);
 const stopHit=dir===1?b.low<=stop:b.high>=stop,takeHit=dir===1?b.high>=take:b.low<=take;
 if(stopHit)return {price:dir===1?Math.min(stop,b.open):Math.max(stop,b.open),reason:takeHit?'BOTH_STOP_FIRST':'STOP'};
 if(takeHit)return {price:take,reason:'TAKE'};
 if(minutes!==null&&b.time-p.entryAt>=minutes*60000)return {price:b.close,reason:'TIME'};
 return null;
}
export async function initStrategyPaper(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_paper_accounts(strategy TEXT NOT NULL,variant TEXT NOT NULL,balance DOUBLE PRECISION NOT NULL DEFAULT 100,position JSONB,last_bar TIMESTAMPTZ,PRIMARY KEY(strategy,variant))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_paper_trades(id BIGSERIAL PRIMARY KEY,strategy TEXT NOT NULL,variant TEXT NOT NULL,side TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price DOUBLE PRECISION NOT NULL,exit_price DOUBLE PRECISION NOT NULL,net_pnl DOUBLE PRECISION NOT NULL,reason TEXT NOT NULL)`);
 for(const key of EXPERIMENT_KEYS)for(const v of EXIT_MODES)await pool.query('INSERT INTO v6_paper_accounts(strategy,variant) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,v.id]);
}
export async function tickStrategyPaper(pool:pg.Pool){
 const client=await pool.connect();
 try{await client.query('BEGIN');
 const r=await client.query(`SELECT start_at,open,high,low,close FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true ORDER BY start_at DESC LIMIT 18`);
 const bars:Bar[]=r.rows.reverse().map(x=>({time:new Date(x.start_at).getTime(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 if(bars.length<17||Date.now()-bars.at(-1)!.time>180000||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000)||bars.some(b=>![b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high)){await client.query('COMMIT');return}
 const bar=bars.at(-1)!;
 for(const key of EXPERIMENT_KEYS){const signal=strategySignal(key,bars.slice(-16));
 for(const variant of EXIT_MODES){
 const a=await client.query('SELECT balance,position,last_bar FROM v6_paper_accounts WHERE strategy=$1 AND variant=$2 FOR UPDATE',[key,variant.id]);const row=a.rows[0];
 if(row.last_bar&&new Date(row.last_bar).getTime()>=bar.time)continue;
 if(row.last_bar&&bar.time-new Date(row.last_bar).getTime()>120000){await client.query('UPDATE v6_paper_accounts SET last_bar=to_timestamp($3/1000.0) WHERE strategy=$1 AND variant=$2',[key,variant.id,bar.time]);continue}
 let balance=Number(row.balance),position=row.position as Position|null;
 if(position&&bar.time>position.entryAt){const decision=strategyExit(position,bar,variant.minutes);if(decision){const dir=position.side==='LONG'?1:-1,exitPrice=decision.price*(1-dir*SLIP);const netPnl=position.quantity*dir*(exitPrice-position.entry)-FEE*position.quantity*(position.entry+exitPrice);balance+=netPnl;await client.query('INSERT INTO v6_paper_trades(strategy,variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,$2,$3,to_timestamp($4/1000.0),to_timestamp($5/1000.0),$6,$7,$8,$9)',[key,variant.id,position.side,position.entryAt,bar.time,position.entry,exitPrice,netPnl,decision.reason]);position=null}}
 else if(!position&&row.last_bar&&signal){const dir=signal==='LONG'?1:-1,entry=bar.close*(1+dir*SLIP);position={entry,entryAt:bar.time+60000,quantity:Math.max(0,balance)*.1/entry,side:signal}}
 await client.query('UPDATE v6_paper_accounts SET balance=$3,position=$4,last_bar=to_timestamp($5/1000.0) WHERE strategy=$1 AND variant=$2',[key,variant.id,balance,position===null?null:JSON.stringify(position),bar.time]);
 }}await client.query('COMMIT')
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function strategyPaperReport(pool:pg.Pool,key:StrategyKey){
 const [a,t]=await Promise.all([pool.query('SELECT variant,balance,position,last_bar FROM v6_paper_accounts WHERE strategy=$1 ORDER BY variant',[key]),pool.query('SELECT id,variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason FROM v6_paper_trades WHERE strategy=$1 ORDER BY id DESC LIMIT 150',[key])]);
 return {mode:'forward-paper',realOrders:false,startingBalance:100,feePerSide:FEE,slippagePerSide:SLIP,variants:EXIT_MODES.map(v=>({...v,...a.rows.find(x=>x.variant===v.id),trades:t.rows.filter(x=>x.variant===v.id)}))};
}
export async function strategyPaperChart(pool:pg.Pool,key:StrategyKey,variant:string,id:string){
 if(!EXIT_MODES.some(v=>v.id===variant))return null;
 let trade:Record<string,unknown>;
 if(id==='active'){const r=await pool.query('SELECT position FROM v6_paper_accounts WHERE strategy=$1 AND variant=$2',[key,variant]);const p=r.rows[0]?.position as Position|null;if(!p)return null;trade={id:'active',variant,side:p.side,entry_at:new Date(p.entryAt).toISOString(),exit_at:new Date().toISOString(),entry_price:p.entry,exit_price:null,reason:'OPEN'}}
 else {if(!/^\d{1,15}$/.test(id))return null;const r=await pool.query('SELECT id,variant,side,entry_at,exit_at,entry_price,exit_price,reason FROM v6_paper_trades WHERE id=$1 AND strategy=$2 AND variant=$3',[id,key,variant]);if(!r.rowCount)return null;trade=r.rows[0]}
 const candles=await pool.query(`SELECT start_at AS time,open,high,low,close FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true AND start_at BETWEEN $1::timestamptz-interval '10 minutes' AND $2::timestamptz+interval '10 minutes' ORDER BY start_at DESC LIMIT 1500`,[trade.entry_at,trade.exit_at]);
 return {trade,candles:candles.rows.reverse()};
}
