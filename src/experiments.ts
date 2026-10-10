import type pg from 'pg';
import {analyze} from './indicators.js';
import {researchSignal} from './research.js';
import {feasibleQuantity} from './contracts.js';
import type {Strategy} from './backtest.js';
export const EXPERIMENTS=[
 {id:2,name:'Скальпинг',strategy:'momentum' as Strategy,maxUsd:25,maxMinutes:30,stop:.004,take:.008,risk:.003,symbols:['SOLUSDT','ETHUSDT']},
 {id:3,name:'Следование тренду',strategy:'trend' as Strategy,maxUsd:40,maxMinutes:60,stop:.006,take:.012,risk:.004,symbols:['ETHUSDT','SOLUSDT']},
 {id:4,name:'RSI разворот',strategy:'reversal' as Strategy,maxUsd:20,maxMinutes:15,stop:.004,take:.008,risk:.002,symbols:['SOLUSDT','ETHUSDT']},
 {id:5,name:'Импульс',strategy:'momentum' as Strategy,maxUsd:60,maxMinutes:90,stop:.008,take:.016,risk:.005,symbols:['SOLUSDT','ETHUSDT']},
 {id:6,name:'Микро 5 минут',strategy:'momentum' as Strategy,maxUsd:5,leverage:5,maxMinutes:5,stop:.004,take:.008,risk:.002,symbols:['SOLUSDT','ETHUSDT']},
 {id:11,name:'Микро 5 минут · наоборот',strategy:'momentum' as Strategy,maxUsd:5,leverage:5,maxMinutes:5,stop:.004,take:.008,risk:.002,symbols:['SOLUSDT','ETHUSDT']},
 {id:7,name:'Volatility Squeeze',strategy:'squeeze',maxUsd:35,maxMinutes:30,stop:.006,take:.012,risk:.004,symbols:['SOLUSDT','ETHUSDT']},
 {id:8,name:'Regime Switching',strategy:'regime',maxUsd:40,maxMinutes:45,stop:.006,take:.012,risk:.004,symbols:['ETHUSDT','SOLUSDT']},
 {id:9,name:'Liquidity Sweep',strategy:'sweep',maxUsd:25,maxMinutes:15,stop:.005,take:.01,risk:.003,symbols:['SOLUSDT','ETHUSDT']},
 {id:10,name:'Quarter-Hour',strategy:'quarter',maxUsd:20,maxMinutes:15,stop:.005,take:.01,risk:.003,symbols:['SOLUSDT','ETHUSDT']}
] as const;
type Bar={start_at:string;open:string;high:string;low:string;close:string;volume:string};
type Pos={symbol:string;side:'LONG'|'SHORT';qty:number;entry:number;stop:number;take:number;entryAt:string};
const fee=.0006,slip=.0002;
export function microQuantity(symbol:string,price:number,balance:number,marginCap=5,leverage=5,stop=.004,risk=.002){
 if(!Number.isFinite(balance)||balance<=0||leverage<1||leverage>5)return 0;
 const margin=Math.min(marginCap,balance);
 const riskNotional=balance*risk/stop;
 const maxNotional=Math.min(margin*leverage,riskNotional,balance*leverage);
 const rules= symbol==='SOLUSDT'?0.1:symbol==='ETHUSDT'?0.01:0;
 if(!rules||!Number.isFinite(price)||price<=0)return 0;
 const qty=Number((Math.floor(maxNotional/price/rules+1e-9)*rules).toFixed(8));
 return qty*price/leverage+qty*price*fee<=balance+1e-8?qty:0;
}
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
 if([...histories.values()].some(x=>x.length<65))return;
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
   if(latest-last>10*60000){
    await client.query('INSERT INTO paper_decisions(account_id,at,event,reason,details) VALUES($1,$2,$3,$4,$5)',[cfg.id,new Date(latest).toISOString(),'SKIP','DATA_GAP',JSON.stringify({gapMinutes:(latest-last)/60000})]);
    await client.query('UPDATE paper_variants SET last_at=$2 WHERE id=$1',[cfg.id,new Date(latest).toISOString()]);await client.query('COMMIT');continue}
   for(let ms=last+60000;ms<=latest;ms+=60000){
    const entries=new Map<string,{bar:Bar;index:number;history:Bar[]}>();
    for(const symbol of cfg.symbols){const a=histories.get(symbol)!;const i=a.findIndex(b=>Date.parse(b.start_at)===ms);if(i>=0)entries.set(symbol,{bar:a[i],index:i,history:a})}
    if(entries.size!==cfg.symbols.length){
     if(new Date(ms).getUTCMinutes()%15===0)await client.query('INSERT INTO paper_decisions(account_id,at,event,reason,details) VALUES($1,$2,$3,$4,$5)',[cfg.id,new Date(ms).toISOString(),'SKIP','MISSING_CANDLE',JSON.stringify({available:[...entries.keys()]})]);
     last=ms;continue
    }
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
      await client.query('INSERT INTO paper_decisions(account_id,at,symbol,event,reason,details) VALUES($1,$2,$3,$4,$5,$6)',[cfg.id,new Date(ms).toISOString(),position.symbol,'CLOSE',stop?'STOP':take?'TAKE':'TIME',JSON.stringify({entry:position.entry,exit:price,qty:position.qty,pnl,balance})]);
      position=null;exited=true;
     }
    }
    if(!position&&!exited){
     let hadSignal=false;
     let rejected=false;
     for(const symbol of cfg.symbols){
      const e=entries.get(symbol)!;
      const history=e.history.slice(Math.max(0,e.index-240),e.index);
      const signal=cfg.id>=7&&cfg.id<=10?researchSignal(history,cfg.strategy as 'squeeze'|'regime'|'sweep'|'quarter'):entryDirection(history,cfg.strategy as Strategy);
      const side=cfg.id===11?(signal==='LONG'?'SHORT':signal==='SHORT'?'LONG':null):signal;
      if(!side)continue;
      hadSignal=true;
      const price=Number(e.bar.open)*(side==='LONG'?1+slip:1-slip);
      const qty=(cfg.id===6||cfg.id===11)?microQuantity(symbol,price,balance):feasibleQuantity(symbol,price,Math.min(balance,cfg.maxUsd),cfg.risk,cfg.stop,fee);
      if(!qty){
       rejected=true;
       await client.query('INSERT INTO paper_decisions(account_id,at,symbol,event,reason,details) VALUES($1,$2,$3,$4,$5,$6)',[cfg.id,new Date(ms).toISOString(),symbol,'REJECT','MIN_ORDER_OR_RISK_LIMIT',JSON.stringify({side,price,maxUsd:cfg.maxUsd,balance,stop:cfg.stop})]);
       continue
      }
      balance-=qty*price*fee;
      position={symbol,side,qty,entry:price,stop:price*(side==='LONG'?1-cfg.stop:1+cfg.stop),take:price*(side==='LONG'?1+cfg.take:1-cfg.take),entryAt:new Date(ms).toISOString()};
      await client.query('INSERT INTO paper_decisions(account_id,at,symbol,event,reason,details) VALUES($1,$2,$3,$4,$5,$6)',[cfg.id,new Date(ms).toISOString(),symbol,'OPEN','SIGNAL',JSON.stringify({strategy:cfg.strategy,side,qty,price,stop:position.stop,take:position.take,fee:qty*price*fee,balance})]);
      break;
     }
     if(!position&&!hadSignal&&ms%(15*60000)===0)await client.query('INSERT INTO paper_decisions(account_id,at,event,reason,details) VALUES($1,$2,$3,$4,$5)',[cfg.id,new Date(ms).toISOString(),'SKIP','NO_SIGNAL',JSON.stringify({strategy:cfg.strategy,activeSymbols:cfg.symbols})]);
    }
    if(ms%(60000)===0){
     const currentPosition=position;
     const quote=currentPosition?Number(entries.get(currentPosition.symbol)!.bar.close):0;
     const unrealized=currentPosition?(quote-currentPosition.entry)*currentPosition.qty*(currentPosition.side==='LONG'?1:-1)-quote*currentPosition.qty*fee:0;
     await client.query('INSERT INTO paper_equity_snapshots(account_id,at,balance,equity,unrealized_pnl,position) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,at) DO NOTHING',[cfg.id,new Date(ms).toISOString(),balance,balance+unrealized,unrealized,JSON.stringify(currentPosition)]);
    }
    last=ms;
   }
   await client.query('UPDATE paper_variants SET balance=$2,last_at=$3,position=$4,updated_at=NOW() WHERE id=$1',[cfg.id,balance,new Date(last).toISOString(),JSON.stringify(position)]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
}
