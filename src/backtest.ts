import {analyze} from './indicators.js';
export type Bar={start_at:string;open:string;high:string;low:string;close:string;volume:string};
export type Trade={side:'LONG'|'SHORT';entryAt:string;exitAt:string;entry:number;exit:number;pnl:number;reason:string};
export type Strategy='momentum'|'trend'|'reversal';
export function backtest(rows:Bar[],initial=100,strategy:Strategy='momentum'){
 const fee=.0006,slippage=.0002,risk=.005,stopDistance=.006,takeDistance=.012;
 let equity=initial,peak=initial,maxDrawdown=0;const trades:Trade[]=[];
 let position:null|{side:'LONG'|'SHORT';entry:number;stop:number;take:number;quantity:number;entryAt:string}=null;
 let pending:null|'LONG'|'SHORT'=null;
 for(let i=30;i<rows.length;i++){
  const b=rows[i],open=Number(b.open),high=Number(b.high),low=Number(b.low),close=Number(b.close);
  if(![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||low>high||open<low||open>high||close<low||close>high)throw Error('Invalid OHLC');
  if(position){
   const p=position;const stopHit=p.side==='LONG'?low<=p.stop:high>=p.stop;
   const takeHit=p.side==='LONG'?high>=p.take:low<=p.take;
   if(stopHit||takeHit){
    // Conservative: stop takes precedence when both reached within one OHLC bar.
    const rawExit=stopHit?p.stop:p.take;const exit=rawExit*(p.side==='LONG'?1-slippage:1+slippage);
    const gross=(exit-p.entry)*p.quantity*(p.side==='LONG'?1:-1);
    const pnl=gross-fee*p.quantity*(p.entry+exit);
    equity+=pnl;trades.push({side:p.side,entryAt:p.entryAt,exitAt:b.start_at,entry:p.entry,exit,pnl,reason:stopHit?'STOP':'TAKE'});
    position=null;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak*100);
   }
  }
  // The signal is computed only from previously closed candles and filled at the NEXT candle open.
  if(!position&&pending){
   const side=pending;pending=null;const entry=open*(side==='LONG'?1+slippage:1-slippage);
   const stop=entry*(side==='LONG'?1-stopDistance:1+stopDistance);
   const take=entry*(side==='LONG'?1+takeDistance:1-takeDistance);
   const quantity=Math.min((equity*risk)/(entry*stopDistance),equity/entry);
   if(quantity>0)position={side,entry,stop,take,quantity,entryAt:b.start_at};
  }
  if(!position&&i<rows.length-1){
   const window=rows.slice(Math.max(0,i-240),i+1);
   const signal=analyze(window).signal;
   if(strategy==='momentum'){
    if(signal==='BULLISH_WATCH')pending='LONG';
    if(signal==='BEARISH_WATCH')pending='SHORT';
   }else if(strategy==='trend'){
    const s=analyze(window);
    if(s.ema9!==null&&s.ema21!==null&&s.rsi14!==null){
     if(s.ema9>s.ema21&&s.rsi14>=55&&s.rsi14<75)pending='LONG';
     if(s.ema9<s.ema21&&s.rsi14<=45&&s.rsi14>25)pending='SHORT';
    }
   }else{
    const s=analyze(window);
    if(s.rsi14!==null){
     if(s.rsi14<30)pending='LONG';
     if(s.rsi14>70)pending='SHORT';
    }
   }
  }
 }
 const wins=trades.filter(t=>t.pnl>0);
 return {strategy,initial,equity,netPnl:equity-initial,returnPct:(equity/initial-1)*100,trades:trades.length,winRate:trades.length?wins.length/trades.length*100:null,maxDrawdown,feesPerSidePct:fee*100,slippagePerSidePct:slippage*100,openPosition:position!==null,tradeHistory:trades.slice(-30)};
}
