import type pg from 'pg';
import {aggregateV7,v7Exit,v7Signal,V7_COST,type V7Bar,type V7Position} from './v7.js';
export type V7BacktestTrade={side:'LONG'|'SHORT';entryAt:number;exitAt:number;entry:number;exit:number;net:number};
export function evaluateV7(bars:V7Bar[],startBalance=100){
 let balance=startBalance,position:V7Position|null=null;
 const trades:V7BacktestTrade[]=[];let peak=balance,maxDrawdown=0,skippedGaps=0;
 for(let i=31;i<bars.length;i++){
  const b=bars[i],previous=bars[i-1];
  if(b.time-previous.time!==300000){skippedGaps++;position=null;continue}
  if(position){
   const action=v7Exit(position,b);
   if(action?.reason==='ATR_STOP'){
    const dir=position.side==='LONG'?1:-1,exit=action.price*(1-dir*V7_COST.slippage);
    const net=position.quantity*dir*(exit-position.entry)-V7_COST.fee*position.quantity*(position.entry+exit);
    balance+=net;trades.push({side:position.side,entryAt:position.entryAt,exitAt:b.time+300000,entry:position.entry,exit,net});position=null;
   }else if(action){position={side:position.side,entry:position.entry,entryAt:position.entryAt,quantity:position.quantity,atr:position.atr,best:action.best,stop:action.stop}}
  }else if(i+1<bars.length&&bars[i+1].time===b.time+300000){
   const recent=bars.slice(i-30,i+1);
   const s=v7Signal(recent);
   if(s){
    const dir=s.side==='LONG'?1:-1,entry=bars[i+1].open*(1+dir*V7_COST.slippage),stop=entry-dir*2*s.atr;
    const quantity=Math.min(Math.max(0,balance)*.01/Math.abs(entry-stop),Math.max(0,balance)*.5/entry);
    if(quantity>0)position={side:s.side,entry,entryAt:bars[i+1].time,quantity,stop,best:entry,atr:s.atr};
   }
  }
  peak=Math.max(peak,balance);maxDrawdown=Math.max(maxDrawdown,peak>0?(peak-balance)/peak:0);
 }
 const wins=trades.filter(x=>x.net>0).length;
 return {startBalance,balance,netPnl:balance-startBalance,trades:trades.length,wins,winRate:trades.length?wins/trades.length:null,maxDrawdown,skippedGaps,openPosition:position!==null,firstBar:bars[0]?.time??null,lastBar:bars.at(-1)?.time??null,examples:trades.slice(-15)};
}
export async function v7HistoricalReport(pool:pg.Pool){
 const r=await pool.query(`SELECT start_at,open,high,low,close,volume FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true AND start_at>=NOW()-interval '14 days' ORDER BY start_at LIMIT 21000`);
 const bars=aggregateV7(r.rows.map(x=>({time:new Date(x.start_at).getTime(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)})));
 const split=Math.floor(bars.length/2);
 const first=evaluateV7(bars.slice(0,split));
 const second=evaluateV7(bars.slice(split));
 return {mode:'historical-simulation',realOrders:false,source:'confirmed 1m database bars aggregated to 5m',daysRequested:14,candles:bars.length,train:first,outOfSample:second,warning:'Exploratory chronological split, not walk-forward optimization. Open positions are not marked to market; gaps cause discontinuation, not simulated fills. Commission/slippage included; funding and spread dynamics excluded.'};
}
