import type pg from 'pg';
import {analyze} from './indicators.js';
import {feasibleQuantity} from './contracts.js';
type Candle={start_at:string;open:string;high:string;low:string;close:string;volume:string};
type Position={symbol:string;side:'LONG'|'SHORT';qty:number;entry:number;stop:number;take:number;entryAt:string};
type State={lastAt:string|null;balance:number;position:Position|null};
const symbolsAllowed=new Set(['BTCUSDT','ETHUSDT','SOLUSDT']);
const fee=.0006,slippage=.0002;
export async function paperTick(pool:pg.Pool,symbols:string[]){
 if(symbols.some(s=>!symbolsAllowed.has(s)))throw Error('Unsupported paper symbol');
 const histories=new Map<string,Candle[]>();
 for(const symbol of symbols){
  const response=await pool.query<Candle>('SELECT start_at::text,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT 280',[symbol]);
  histories.set(symbol,response.rows.reverse());
 }
 if(symbols.some(s=>(histories.get(s)?.length??0)<32))return;
 const latest=Math.min(...symbols.map(s=>Date.parse(histories.get(s)!.at(-1)!.start_at)));
 if(!Number.isFinite(latest))return;
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const result=await client.query<{last_at:string|null;balance:string;position:Position|null}>('SELECT last_at::text,balance::text,position FROM paper_account WHERE id=1 FOR UPDATE');
  const previous=result.rows[0];
  if(!previous)throw Error('Paper account missing');
  if(!previous.last_at){
   await client.query('UPDATE paper_account SET last_at=$1 WHERE id=1',[new Date(latest).toISOString()]);
   await client.query('COMMIT');return;
  }
  const from=Date.parse(previous.last_at);
  if(latest<=from){await client.query('COMMIT');return}
  if(latest-from>10*60000){await client.query('UPDATE paper_account SET last_at=$1 WHERE id=1',[new Date(latest).toISOString()]);await client.query('COMMIT');console.warn('PAPER_GAP_SKIP',latest-from);return}
  let state:State={lastAt:previous.last_at,balance:Number(previous.balance),position:previous.position};
  for(let ms=from+60000;ms<=latest;ms+=60000){
   const activeBars=new Map<string,{bar:Candle;index:number;history:Candle[]}>();
   for(const symbol of symbols){
    const history=histories.get(symbol)!;
    const index=history.findIndex(b=>Date.parse(b.start_at)===ms);
    if(index>=0)activeBars.set(symbol,{bar:history[index],index,history});
   }
   if(activeBars.size!==symbols.length){state.lastAt=new Date(ms).toISOString();continue}
   const p=state.position;
   let exited=false;
   if(p){
    const current=activeBars.get(p.symbol)!.bar;
    const low=Number(current.low),high=Number(current.high);
    const stopped=p.side==='LONG'?low<=p.stop:high>=p.stop;
    const taken=p.side==='LONG'?high>=p.take:low<=p.take;
    if(stopped||taken){
     const price=(stopped?p.stop:p.take)*(p.side==='LONG'?1-slippage:1+slippage);
     const gross=(price-p.entry)*p.qty*(p.side==='LONG'?1:-1);
     const exitFee=p.qty*price*fee;
     const pnl=gross-p.entry*p.qty*fee-exitFee;
     state.balance+=gross-exitFee;
     await client.query('INSERT INTO paper_trades(symbol,side,quantity,entry_price,exit_price,entry_at,exit_at,pnl,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.symbol,p.side,p.qty,p.entry,price,p.entryAt,new Date(ms).toISOString(),pnl,stopped?'STOP':'TAKE']);
     await client.query('INSERT INTO paper_decisions(account_id,at,symbol,event,reason,details) VALUES(1,$1,$2,$3,$4,$5)',[new Date(ms).toISOString(),p.symbol,'CLOSE',stopped?'STOP':'TAKE',JSON.stringify({entry:p.entry,exit:price,qty:p.qty,pnl,balance:state.balance})]);
     state.position=null;exited=true;
    }
   }
   if(!state.position&&!exited){
    let foundSignal=false;
    for(const symbol of symbols){
     const x=activeBars.get(symbol)!;
     const signal=analyze(x.history.slice(Math.max(0,x.index-241),x.index)).signal;
     const side=signal==='BULLISH_WATCH'?'LONG':signal==='BEARISH_WATCH'?'SHORT':null;
     if(!side)continue;
     foundSignal=true;
     const price=Number(x.bar.open)*(side==='LONG'?1+slippage:1-slippage);
     const qty=feasibleQuantity(symbol,price,state.balance,.005,.006,fee);
     if(!qty){
      await client.query('INSERT INTO paper_decisions(account_id,at,symbol,event,reason,details) VALUES(1,$1,$2,$3,$4,$5)',[new Date(ms).toISOString(),symbol,'REJECT','MIN_ORDER_OR_RISK_LIMIT',JSON.stringify({side,price,balance:state.balance})]);continue
     }
     const entryFee=price*qty*fee;
     state.balance-=entryFee;
     state.position={symbol,side,qty,entry:price,stop:price*(side==='LONG'?.994:1.006),take:price*(side==='LONG'?1.012:.988),entryAt:new Date(ms).toISOString()};
     await client.query('INSERT INTO paper_decisions(account_id,at,symbol,event,reason,details) VALUES(1,$1,$2,$3,$4,$5)',[new Date(ms).toISOString(),symbol,'OPEN','SIGNAL',JSON.stringify({side,qty,entry:price,fee:entryFee,balance:state.balance})]);
     break;
    }
    if(!foundSignal&&!state.position&&ms%(15*60000)===0)await client.query('INSERT INTO paper_decisions(account_id,at,event,reason) VALUES(1,$1,$2,$3)',[new Date(ms).toISOString(),'SKIP','NO_SIGNAL']);
   }
   state.lastAt=new Date(ms).toISOString();
  }
  await client.query('UPDATE paper_account SET balance=$1,position=$2,last_at=$3,updated_at=NOW() WHERE id=1',[state.balance,JSON.stringify(state.position),state.lastAt]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
