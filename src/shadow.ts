import type pg from 'pg';
import {EXPERIMENTS,entryDirection,microQuantity} from './experiments.js';
import {researchSignal} from './research.js';
import {feasibleQuantity} from './contracts.js';
import type {Strategy} from './backtest.js';
type Bar={start_at:string;open:string;high:string;low:string;close:string;volume:string};
type Pos={symbol:string;side:'LONG'|'SHORT';qty:number;entry:number;stop:number;take:number;entryAt:string};
type Config={id:number;strategy:string;symbols:readonly string[];maxUsd:number;maxMinutes:number|null;stop:number;take:number;risk:number;leverage?:number};
const FEE=.0006,SLIP=.0002;
export const SHADOW_VERSION='v2-conservative-2026-10-10';
const configs:Config[]=[{id:1,strategy:'momentum',symbols:['BTCUSDT','ETHUSDT','SOLUSDT'],maxUsd:100,maxMinutes:null,stop:.006,take:.012,risk:.005},...EXPERIMENTS];
export function shadowExit(p:Pos,b:Bar,at:number,maxMinutes:number|null){
 const open=Number(b.open),high=Number(b.high),low=Number(b.low);
 if(maxMinutes!==null&&at-Date.parse(p.entryAt)>=maxMinutes*60000)return {reason:'TIME',raw:open};
 const stopHit=p.side==='LONG'?low<=p.stop:high>=p.stop;
 const takeHit=p.side==='LONG'?high>=p.take:low<=p.take;
 // On gaps, fill stop at the worse open, never at a better invisible stop.
 if(stopHit)return {reason:'STOP',raw:p.side==='LONG'?Math.min(p.stop,open):Math.max(p.stop,open)};
 if(takeHit)return {reason:'TAKE',raw:p.side==='LONG'?(open>=p.take?open:p.take):(open<=p.take?open:p.take)};
 return null;
}
function direction(history:Bar[],cfg:Config){
 const signal=cfg.id>=7&&cfg.id<=10?researchSignal(history,cfg.strategy as 'squeeze'|'regime'|'sweep'|'quarter'):entryDirection(history,cfg.strategy as Strategy);
 return cfg.id===11?(signal==='LONG'?'SHORT':signal==='SHORT'?'LONG':null):signal;
}
export async function initShadow(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS shadow_accounts(
  account_id INTEGER PRIMARY KEY,version TEXT NOT NULL,balance NUMERIC NOT NULL,last_at TIMESTAMPTZ,
  position JSONB,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS shadow_trades(
  id BIGSERIAL PRIMARY KEY,account_id INTEGER NOT NULL,version TEXT NOT NULL,
  symbol TEXT NOT NULL,side TEXT NOT NULL,quantity NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,exit_price NUMERIC NOT NULL,
  entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,pnl NUMERIC NOT NULL,reason TEXT NOT NULL)`);
 await pool.query('CREATE INDEX IF NOT EXISTS shadow_trades_account_idx ON shadow_trades(account_id,id DESC)');
 await pool.query(`CREATE TABLE IF NOT EXISTS shadow_equity(
  account_id INTEGER NOT NULL,at TIMESTAMPTZ NOT NULL,balance NUMERIC NOT NULL,
  equity NUMERIC NOT NULL,unrealized_pnl NUMERIC NOT NULL,PRIMARY KEY(account_id,at))`);
 for(const c of configs)await pool.query('INSERT INTO shadow_accounts(account_id,version,balance) VALUES($1,$2,100) ON CONFLICT(account_id) DO NOTHING',[c.id,SHADOW_VERSION]);
}
export async function tickShadow(pool:pg.Pool){
 const histories=new Map<string,Bar[]>();
 for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
  const q=await pool.query<Bar>('SELECT start_at::text,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT 280',[symbol]);
  histories.set(symbol,q.rows.reverse());
 }
 if([...histories.values()].some(x=>x.length<65))return;
 for(const cfg of configs){
  const latest=Math.min(...cfg.symbols.map(s=>Date.parse(histories.get(s)!.at(-1)!.start_at)));
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query<{balance:string;last_at:string|null;position:Pos|null}>('SELECT balance::text,last_at::text,position FROM shadow_accounts WHERE account_id=$1 FOR UPDATE',[cfg.id]);
   const prev=q.rows[0];if(!prev)throw Error('Shadow account missing '+cfg.id);
   if(!prev.last_at){await client.query('UPDATE shadow_accounts SET last_at=$2 WHERE account_id=$1',[cfg.id,new Date(latest).toISOString()]);await client.query('COMMIT');continue}
   let last=Date.parse(prev.last_at),balance=Number(prev.balance),position=prev.position;
   if(latest<=last){await client.query('COMMIT');continue}
   if(latest-last>10*60000){
    // Continue to track existing open positions on the first available candle. No fake exit in the gap.
    last=latest-60000;
   }
   for(let at=last+60000;at<=latest;at+=60000){
    const entries=new Map<string,{bar:Bar;history:Bar[];index:number}>();
    for(const symbol of cfg.symbols){const history=histories.get(symbol)!;const index=history.findIndex(b=>Date.parse(b.start_at)===at);if(index>=0)entries.set(symbol,{bar:history[index],history,index})}
    if(entries.size!==cfg.symbols.length){last=at;continue}
    let exited=false;
    const close=(p:Pos,b:Bar,fill:{reason:string;raw:number})=>{
     const price=fill.raw*(p.side==='LONG'?1-SLIP:1+SLIP);
     const gross=(price-p.entry)*p.qty*(p.side==='LONG'?1:-1);
     const exitFee=p.qty*price*FEE,pnl=gross-p.entry*p.qty*FEE-exitFee;
     balance+=gross-exitFee;
     return {price,pnl};
    };
    if(position){
     const b=entries.get(position.symbol)!.bar;
     const hit=shadowExit(position,b,at,cfg.maxMinutes);
     if(hit){
      const p=position,{price,pnl}=close(p,b,hit);
      await client.query('INSERT INTO shadow_trades(account_id,version,symbol,side,quantity,entry_price,exit_price,entry_at,exit_at,pnl,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[cfg.id,SHADOW_VERSION,p.symbol,p.side,p.qty,p.entry,price,p.entryAt,new Date(at).toISOString(),pnl,hit.reason]);
      position=null;exited=true;
     }
    }
    if(!position&&!exited){
     for(const symbol of cfg.symbols){
      const e=entries.get(symbol)!;
      const history=e.history.slice(Math.max(0,e.index-240),e.index);
      const side=direction(history,cfg);if(!side)continue;
      const price=Number(e.bar.open)*(side==='LONG'?1+SLIP:1-SLIP);
      const qty=(cfg.id===6||cfg.id===11)?microQuantity(symbol,price,balance):feasibleQuantity(symbol,price,cfg.id===1?balance:Math.min(balance,cfg.maxUsd),cfg.risk,cfg.stop,FEE);
      if(!qty)continue;
      balance-=qty*price*FEE;
      const opened:Pos={symbol,side,qty,entry:price,stop:price*(side==='LONG'?1-cfg.stop:1+cfg.stop),take:price*(side==='LONG'?1+cfg.take:1-cfg.take),entryAt:new Date(at).toISOString()};
      position=opened;
      // Unlike v1, the entry candle's full range participates in exit detection.
      // STOP first when stop and take both hit, a conservative OHLC ambiguity rule.
      const hit=shadowExit(opened,e.bar,at,cfg.maxMinutes);
      if(hit){
       const {price:exitPrice,pnl}=close(opened,e.bar,hit);
       await client.query('INSERT INTO shadow_trades(account_id,version,symbol,side,quantity,entry_price,exit_price,entry_at,exit_at,pnl,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[cfg.id,SHADOW_VERSION,symbol,side,qty,price,exitPrice,opened.entryAt,new Date(at).toISOString(),pnl,hit.reason]);
       position=null;exited=true;
      }
      break;
     }
    }
    const closePrice=position?Number(entries.get(position.symbol)!.bar.close):0;
    const unrealized=position?(closePrice-position.entry)*position.qty*(position.side==='LONG'?1:-1)-closePrice*position.qty*FEE:0;
    await client.query('INSERT INTO shadow_equity(account_id,at,balance,equity,unrealized_pnl) VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id,at) DO NOTHING',[cfg.id,new Date(at).toISOString(),balance,balance+unrealized,unrealized]);
    last=at;
   }
   await client.query('UPDATE shadow_accounts SET balance=$2,position=$3,last_at=$4,updated_at=NOW() WHERE account_id=$1',[cfg.id,balance,JSON.stringify(position),new Date(last).toISOString()]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
}
export async function shadowReport(pool:pg.Pool){
 const q=await pool.query(`SELECT s.account_id,s.version,s.balance::text,s.last_at::text,s.position,
  COUNT(t.id)::int AS trades,COALESCE(SUM(t.pnl),0)::text AS realized_pnl
  FROM shadow_accounts s LEFT JOIN shadow_trades t ON t.account_id=s.account_id
  GROUP BY s.account_id,s.version,s.balance,s.last_at,s.position ORDER BY s.account_id`);
 return {version:SHADOW_VERSION,start:'forward-only; separate $100 capital',accounts:q.rows};
}
