import type pg from 'pg';
import {strategySignal,strategyExit,FEE,SLIP} from './strategy-paper.js';

type Bar={time:number;open:number;high:number;low:number;close:number};
type Position={entry:number;entryAt:number;quantity:number;side:'LONG'|'SHORT'};
export const OOS_KEY='dip_reversal_oos';
export const OOS_VARIANTS=[{id:'30m',minutes:30},{id:'4h',minutes:240},{id:'bracket',minutes:null}] as const;
export async function initDipOos(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_dip_oos_accounts(variant TEXT PRIMARY KEY,balance DOUBLE PRECISION NOT NULL DEFAULT 100,position JSONB,last_bar TIMESTAMPTZ)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_dip_oos_trades(id BIGSERIAL PRIMARY KEY,variant TEXT NOT NULL,side TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price DOUBLE PRECISION NOT NULL,exit_price DOUBLE PRECISION NOT NULL,net_pnl DOUBLE PRECISION NOT NULL,reason TEXT NOT NULL)`);
 for(const v of OOS_VARIANTS)await pool.query('INSERT INTO v6_dip_oos_accounts(variant) VALUES($1) ON CONFLICT DO NOTHING',[v.id]);
}
export async function tickDipOos(pool:pg.Pool){
 const client=await pool.connect();
 try{
 await client.query('BEGIN');
 const r=await client.query("SELECT start_at,open,high,low,close FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true ORDER BY start_at DESC LIMIT 18");
 const bars:Bar[]=r.rows.reverse().map(x=>({time:new Date(x.start_at).getTime(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 if(bars.length<18||Date.now()-bars.at(-1)!.time>180000||bars.some((b,i)=>i>0&&b.time-bars[i-1].time!==60000)||bars.some(b=>![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high)){await client.query('COMMIT');return}
 const bar=bars.at(-1)!;
 // Signal from completed candles only; fill is modelled at next candle open.
 const signal=strategySignal('dip_reversal',bars.slice(-16));
 for(const variant of OOS_VARIANTS){
 const a=await client.query('SELECT balance,position,last_bar FROM v6_dip_oos_accounts WHERE variant=$1 FOR UPDATE',[variant.id]);
 const row=a.rows[0];if(!row)continue;
 const previous=row.last_bar?new Date(row.last_bar).getTime():null;
 if(previous!==null&&previous>=bar.time)continue;
 if(previous===null||bar.time-previous>60000){await client.query('UPDATE v6_dip_oos_accounts SET last_bar=to_timestamp($2/1000.0) WHERE variant=$1',[variant.id,bar.time]);continue}
 let balance=Number(row.balance),position=row.position as Position|null;
 if(position){
 const decision=strategyExit(position,bar,variant.minutes);
 if(decision){const dir=position.side==='LONG'?1:-1,exit=decision.price*(1-dir*SLIP),net=position.quantity*dir*(exit-position.entry)-FEE*position.quantity*(position.entry+exit);balance+=net;
 await client.query('INSERT INTO v6_dip_oos_trades(variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,$2,to_timestamp($3/1000.0),to_timestamp($4/1000.0),$5,$6,$7,$8)',[variant.id,position.side,position.entryAt,bar.time,position.entry,exit,net,decision.reason]);position=null}
 }else if(signal){const dir=signal==='LONG'?1:-1;position={entry:bar.close*(1+dir*SLIP),entryAt:bar.time+60000,quantity:Math.max(0,balance)*.1/(bar.close*(1+dir*SLIP)),side:signal}}
 await client.query('UPDATE v6_dip_oos_accounts SET balance=$2,position=$3,last_bar=to_timestamp($4/1000.0) WHERE variant=$1',[variant.id,balance,position?JSON.stringify(position):null,bar.time]);
 }
 await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function dipOosReport(pool:pg.Pool){
 const [accounts,trades]=await Promise.all([pool.query('SELECT * FROM v6_dip_oos_accounts ORDER BY variant'),pool.query('SELECT * FROM v6_dip_oos_trades ORDER BY id DESC LIMIT 150')]);
 return {strategy:OOS_KEY,mode:'forward-paper',realOrders:false,startingBalance:100,feePerSide:FEE,slippagePerSide:SLIP,warning:'Independent forward paper experiment; no out-of-sample profitability established.',variants:OOS_VARIANTS.map(v=>({...v,...accounts.rows.find(x=>x.variant===v.id),trades:trades.rows.filter(t=>t.variant===v.id)}))};
}

export async function dipOosChart(pool:pg.Pool,variant:string,id:string){
 if(!OOS_VARIANTS.some(v=>v.id===variant))return null;
 let trade:any;
 if(id==='active'){
  const r=await pool.query('SELECT position FROM v6_dip_oos_accounts WHERE variant=$1',[variant]);
  const p=r.rows[0]?.position as Position|null;if(!p)return null;
  trade={id:'active',variant,side:p.side,entry_at:new Date(p.entryAt).toISOString(),exit_at:new Date().toISOString(),entry_price:p.entry,exit_price:null,reason:'OPEN'};
 }else{
  if(!/^\d{1,15}$/.test(id))return null;
  const r=await pool.query('SELECT * FROM v6_dip_oos_trades WHERE id=$1 AND variant=$2',[id,variant]);
  if(!r.rowCount)return null;trade=r.rows[0];
 }
 const candles=await pool.query(`SELECT start_at AS time,open,high,low,close FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true AND start_at BETWEEN $1::timestamptz-interval '10 minutes' AND $2::timestamptz+interval '10 minutes' ORDER BY start_at DESC LIMIT 1500`,[trade.entry_at,trade.exit_at]);
 return {trade,candles:candles.rows.reverse()};
}
