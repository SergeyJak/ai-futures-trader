import type pg from 'pg';
import {analyze} from './indicators.js';
import {feasibleQuantity} from './contracts.js';
import type {Strategy} from './backtest.js';
export const EXPERIMENTS=[
 {id:2,name:'Скальпинг',strategy:'momentum' as Strategy,maxUsd:25,maxMinutes:30,stop:.004,take:.008,risk:.003,symbols:['SOLUSDT','ETHUSDT']},
 {id:3,name:'Следование тренду',strategy:'trend' as Strategy,maxUsd:40,maxMinutes:60,stop:.006,take:.012,risk:.004,symbols:['ETHUSDT','SOLUSDT']},
 {id:4,name:'RSI разворот',strategy:'reversal' as Strategy,maxUsd:20,maxMinutes:15,stop:.004,take:.008,risk:.002,symbols:['SOLUSDT','ETHUSDT']},
 {id:5,name:'Импульс',strategy:'momentum' as Strategy,maxUsd:60,maxMinutes:90,stop:.008,take:.016,risk:.005,symbols:['SOLUSDT','ETHUSDT']}
] as const;
type Bar={start_at:string;open:string;high:string;low:string;close:string;volume:string};
type Pos={symbol:string;side:'LONG'|'SHORT';qty:number;entry:number;stop:number;take:number;entryAt:string};
const fee=.0006,slip=.0002;
export function entryDirection(rows:Bar[],strategy:Strategy):'LONG'|'SHORT'|null{
 const s=analyze(rows);
 if(strategy==='momentum')return s.signal==='BULLISH_WATCH'?'LONG':s.signal==='BEARISH_WATCH'?'SHORT':null;
 if(strategy==='trend')return s.ema9!==null&&s.ema21!==null&&s.rsi14!==null?(s.ema9>s.ema21&&s.rsi14>=55&&s.rsi14<75?'LONG':s.ema9<s.ema21&&s.rsi14<=45&&s.rsi14>25?'SHORT':null):null;
 return s.rsi14===null?null:s.rsi14<30?'LONG':s.rsi14>70?'SHORT':null;
}
export async function runExperiments(pool:pg.Pool){
 const histories=new Map<string,Bar[]>();
 for(const symbol of ['SOLUSDT','ETHUSDT']){
  const q=await pool.query<Bar>('SELECT start_at::text,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT 280',[symbol]);
  histories.set(symbol,q.rows.reverse());
 }
 if([...histories.values()].some(x=>x.length<35))return;
 const latest=Math.min(...[...histories.values()].map(a=>Date.parse(a.at(-1)!.start_at)));
 if(!Number.isFinite(latest))return;
 for(const cfg of EXPERIMENTS){
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query<{balance:string;last_at:string|null;position:Pos|null}>('SELECT balance::text,last_at::text,position FROM paper_variants WHERE id=$1 FOR UPDATE',[cfg.id]);
   if(!q.rows.length)throw Error('Missing variant '+cfg.id);
   const prev=q.rows[0];let balance=Number(prev.balance),position=prev.position;
   if(!prev.last_at){await client.query('UPDATE paper_variants SET last_at=$2 WHERE id=$1',[cfg.id,new Date(latest).toISOString()]);await client.query('COMMIT');continue}
   let last=Date.parse(prev.last_at);
   if(latest<=last){await client.query('COMMIT');continue}
   if(latest-last>10*60000){await client.query('UPDATE paper_variants SET last_at=$2 WHERE id=$1',[cfg.id,new Date(latest).toISOString()]);await client.query('COMMIT');continue}
   for(let ms=last+60000;ms<=latest;ms+=60000){
    const entries=new Map<string,{bar:Bar;index:number;history:Bar[]}>();
    for(const symbol of cfg.symbols){const a=histories.get(symbol)!;const i=a.findIndex(b=>Date.parse(b.start_at)===ms);if(i>=0)entries.set(symbol,{bar:a[i],index:i,history:a})}
    if(entries.size!==cfg.symbols.length){last=ms;continue}
    let exited=false;
    if(position){
     const b=entries.get(position.symbol)!.bar;const lo=Number(b.low),hi=Number(b.high);
     const stop=position.side==='LONG'?lo<=position.stop:hi>=position.stop;
     const take=position.side==='LONG'?hi>=position.take:lo<=position.take;
     const timeout=ms-Date.parse(position.entryAt)>=cfg.maxMinutes*60000;
     if(stop||take||timeout){
      const raw=stop?position.stop:take?position.take:Number(b.open);
      const price=raw*(position.side==='LONG'?1-slip:1+slip);
      const gross=(price-position.entry)*position.qty*(position.side==='LONG'?1:-1);
      const exitFee=position.qty*price*fee;
      const pnl=gross-position.entry*position.qty*fee-exitFee;
      balance+=gross-exitFee;
      await client.query('INSERT INTO paper_trades(account_id,symbol,side,quantity,entry_price,exit_price,entry_at,exit_at,pnl,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[cfg.id,position.symbol,position.side,position.qty,position.entry,price,position.entryAt,new Date(ms).toISOString(),pnl,stop?'STOP':take?'TAKE':'TIME']);
      position=null;exited=true;
     }
    }
    if(!position&&!exited){
     for(const symbol of cfg.symbols){
      const e=entries.get(symbol)!;
      const side=entryDirection(e.history.slice(Math.max(0,e.index-240),e.index),cfg.strategy);
      if(!side)continue;
      const price=Number(e.bar.open)*(side==='LONG'?1+slip:1-slip);
      const qty=feasibleQuantity(symbol,price,Math.min(balance,cfg.maxUsd),cfg.risk,cfg.stop,fee);
      if(!qty)continue;
      balance-=qty*price*fee;
      position={symbol,side,qty,entry:price,stop:price*(side==='LONG'?1-cfg.stop:1+cfg.stop),take:price*(side==='LONG'?1+cfg.take:1-cfg.take),entryAt:new Date(ms).toISOString()};
      break;
     }
    }
    last=ms;
   }
   await client.query('UPDATE paper_variants SET balance=$2,last_at=$3,position=$4,updated_at=NOW() WHERE id=$1',[cfg.id,balance,new Date(last).toISOString(),JSON.stringify(position)]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
}
