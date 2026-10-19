import type pg from 'pg';
import {aggregateV8Bars} from './v8-candle-aggregation.js';
import {v8Signal,V8_FEE_PER_SIDE,V8_SLIPPAGE_PER_SIDE,type V8Bar,type V8Side} from './v8-liquidity-sweep.js';
export const V8_CONFIGS=[...['BTCUSDT','ETHUSDT','SOLUSDT'].flatMap(symbol=>[5,15].map(timeframe=>({symbol,timeframe,id:symbol+'-'+timeframe+'m'})))];
type Position={side:V8Side;entry:number;stop:number;take:number;quantity:number;entryAt:number};
type Pending={side:V8Side;stop:number;take:number;signalAt:number};
export function v8Exit(p:Position,b:V8Bar){
 const dir=p.side==='LONG'?1:-1;
 const stop=dir===1?b.low<=p.stop:b.high>=p.stop,take=dir===1?b.high>=p.take:b.low<=p.take;
 if(stop)return {price:dir===1?Math.min(p.stop,b.open):Math.max(p.stop,b.open),reason:take?'BOTH_STOP_FIRST':'STOP'};
 if(take)return {price:p.take,reason:'TAKE'};
 if(b.time-p.entryAt>=24*60*60000)return {price:b.close,reason:'TIME'};
 return null;
}
export async function initV8Paper(pool:pg.Pool){
 await pool.query('CREATE TABLE IF NOT EXISTS v8_paper_accounts(id TEXT PRIMARY KEY,balance DOUBLE PRECISION NOT NULL DEFAULT 100,position JSONB,pending JSONB,last_bar TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await pool.query('CREATE TABLE IF NOT EXISTS v8_paper_trades(id BIGSERIAL PRIMARY KEY,variant TEXT NOT NULL,side TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price DOUBLE PRECISION NOT NULL,exit_price DOUBLE PRECISION NOT NULL,net_pnl DOUBLE PRECISION NOT NULL,reason TEXT NOT NULL)');
 for(const c of V8_CONFIGS)await pool.query('INSERT INTO v8_paper_accounts(id) VALUES($1) ON CONFLICT DO NOTHING',[c.id]);
}
export async function tickV8Paper(pool:pg.Pool){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
   const r=await client.query('SELECT start_at,open,high,low,close FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT 205',[symbol]);
   const bars:V8Bar[]=r.rows.reverse().map(x=>({time:new Date(x.start_at).getTime(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
   const bar=bars.at(-1);
   if(!bar||bars.length<181||Date.now()-bar.time>180000||bars.some((b,i)=>![b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0)||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high||(i>0&&b.time-bars[i-1].time!==60000)))continue;
   for(const cfg of V8_CONFIGS.filter(c=>c.symbol===symbol)){
    const a=await client.query('SELECT balance,position,pending,last_bar FROM v8_paper_accounts WHERE id=$1 FOR UPDATE',[cfg.id]);const row=a.rows[0];
    if(row.last_bar&&new Date(row.last_bar).getTime()>=bar.time)continue;
    if(!row.last_bar||bar.time-new Date(row.last_bar).getTime()>120000){
     await client.query('UPDATE v8_paper_accounts SET last_bar=to_timestamp($2/1000.0),pending=NULL WHERE id=$1',[cfg.id,bar.time]);continue;
    }
    let balance=Number(row.balance),position=row.position as Position|null,pending=row.pending as Pending|null;
    if(position){
     const exit=v8Exit(position,bar);
     if(exit){const dir=position.side==='LONG'?1:-1,price=exit.price*(1-dir*V8_SLIPPAGE_PER_SIDE),pnl=position.quantity*dir*(price-position.entry)-V8_FEE_PER_SIDE*position.quantity*(position.entry+price);balance+=pnl;
      await client.query('INSERT INTO v8_paper_trades(variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,$2,to_timestamp($3/1000.0),to_timestamp($4/1000.0),$5,$6,$7,$8)',[cfg.id,position.side,position.entryAt,bar.time,position.entry,price,pnl,exit.reason]);position=null}
    }else if(pending){
     if(pending.signalAt+60000===bar.time){
      const dir=pending.side==='LONG'?1:-1,entry=bar.open*(1+dir*V8_SLIPPAGE_PER_SIDE);
      position={side:pending.side,entry,stop:pending.stop,take:pending.take,quantity:Math.max(0,balance)*.1/entry,entryAt:bar.time};
      const exit=v8Exit(position,bar);
      if(exit){const price=exit.price*(1-dir*V8_SLIPPAGE_PER_SIDE),pnl=position.quantity*dir*(price-entry)-V8_FEE_PER_SIDE*position.quantity*(entry+price);balance+=pnl;
       await client.query('INSERT INTO v8_paper_trades(variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,$2,to_timestamp($3/1000.0),to_timestamp($4/1000.0),$5,$6,$7,$8)',[cfg.id,pending.side,bar.time,bar.time,entry,price,pnl,exit.reason]);position=null}
     }
     pending=null;
    }
    if(!position&&!pending){
     const tf=cfg.timeframe;
     const candles=aggregateV8Bars(bars,tf as 5|15);
     const last=candles.at(-1);
     if(last&&last.time+tf*60000===bar.time+60000){const signal=v8Signal(candles.slice(-13));if(signal)pending={side:signal.side,stop:signal.stop,take:signal.take,signalAt:bar.time}}
    }
    await client.query('UPDATE v8_paper_accounts SET balance=$2,position=$3,pending=$4,last_bar=to_timestamp($5/1000.0) WHERE id=$1',[cfg.id,balance,position?JSON.stringify(position):null,pending?JSON.stringify(pending):null,bar.time]);
   }
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function v8PaperReport(pool:pg.Pool){
 const [accounts,trades,totals]=await Promise.all([
  pool.query('SELECT id,balance,position,pending,last_bar FROM v8_paper_accounts ORDER BY id'),
  pool.query('SELECT id,variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason FROM v8_paper_trades ORDER BY id DESC LIMIT 120'),
  pool.query('SELECT variant,COUNT(*)::int AS closed,COALESCE(SUM(net_pnl),0)::double precision AS net,COUNT(*) FILTER(WHERE net_pnl>0)::int AS wins FROM v8_paper_trades GROUP BY variant')
 ]);
 return {mode:'forward-only-paper',realOrders:false,startingBalance:100,feePerSide:V8_FEE_PER_SIDE,slippagePerSide:V8_SLIPPAGE_PER_SIDE,funding:'excluded; unknown',warning:'Candle OHLC execution approximation; not real exchange fills',variants:V8_CONFIGS.map(c=>({...c,...accounts.rows.find(a=>a.id===c.id),closedTrades:totals.rows.find(t=>t.variant===c.id)?.closed??0,netPnl:totals.rows.find(t=>t.variant===c.id)?.net??0,wins:totals.rows.find(t=>t.variant===c.id)?.wins??0,trades:trades.rows.filter(t=>t.variant===c.id)}))};
}
