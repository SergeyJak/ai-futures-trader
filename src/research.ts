import {feasibleQuantity} from './contracts.js';
import {analyze} from './indicators.js';
import type {Bar} from './backtest.js';
export type Candidate='squeeze'|'regime'|'sweep'|'quarter';
export function researchSignal(rows:Bar[],candidate:Candidate):'LONG'|'SHORT'|null{
 if(rows.length<61)return null;
 const recent=rows.slice(-61);
 const closes=recent.map(b=>Number(b.close)),highs=recent.map(b=>Number(b.high)),lows=recent.map(b=>Number(b.low));
 if([...closes,...highs,...lows].some(n=>!Number.isFinite(n)||n<=0))return null;
 const last=closes.at(-1)!;
 if(candidate==='sweep'){
  const prevHigh=Math.max(...highs.slice(-21,-1)),prevLow=Math.min(...lows.slice(-21,-1));
  const lastBar=recent.at(-1)!;
  return Number(lastBar.high)>prevHigh&&last<prevHigh&&last>prevLow?'SHORT':
   Number(lastBar.low)<prevLow&&last>prevLow&&last<prevHigh?'LONG':null;
 }
 if(candidate==='quarter'){
  const at=Date.parse(recent.at(-1)!.start_at);
  if(!Number.isFinite(at)||new Date(at).getUTCMinutes()%15!==0)return null;
  const prior=closes.at(-6)!;
  const move=last/prior-1;
  return move>.002?'LONG':move<-.002?'SHORT':null;
 }
 if(candidate==='squeeze'){
  const widths:number[]=[];
  for(let i=20;i<61;i++){const arr=closes.slice(i-20,i);const avg=arr.reduce((a,b)=>a+b,0)/20;const std=Math.sqrt(arr.reduce((a,b)=>a+(b-avg)**2,0)/20);widths.push(4*std/avg)}
  const baseline=widths.slice(0,-1).sort((a,b)=>a-b);
  const contracted=widths.at(-2)!<=baseline[Math.floor(baseline.length*.25)];
  const ceiling=Math.max(...highs.slice(-21,-1)),floor=Math.min(...lows.slice(-21,-1));
  const v=Number(recent.at(-1)!.volume),volumes=recent.slice(-21,-1).map(b=>Number(b.volume));
  const avg=volumes.reduce((a,b)=>a+b,0)/volumes.length;
  if(!contracted||!Number.isFinite(v)||avg<=0||v<avg*1.3)return null;
  return last>ceiling?'LONG':last<floor?'SHORT':null;
 }
 const prices=closes.slice(-31),changes=prices.slice(1).map((p,i)=>Math.abs(Math.log(p/prices[i])));
 const volatility=changes.reduce((a,b)=>a+b,0)/changes.length;
 const drift=Math.abs(Math.log(prices.at(-1)!/prices[0]));
 const state=drift/(changes.reduce((a,b)=>a+b,0)+1e-12);
 const signal=analyze(recent).signal;
 if(volatility>.008||state<.28)return null;
 return signal==='BULLISH_WATCH'?'LONG':signal==='BEARISH_WATCH'?'SHORT':null;
}
export function evaluateCandidate(rows:Bar[],candidate:Candidate,symbol:string){
 const fee=.0006,slippage=.0002,initial=100,stop=.006,take=.012,maxMinutes=30;
 let balance=initial,opened:null|{side:'LONG'|'SHORT';entry:number;qty:number;stop:number;take:number;at:number}=null;
 let count=0,wins=0,skipped=0,peak=initial,drawdown=0;
 for(let i=61;i<rows.length;i++){
  const b=rows[i],open=Number(b.open),high=Number(b.high),low=Number(b.low);
  if(![open,high,low].every(n=>Number.isFinite(n)&&n>0))continue;
  if(opened){
   const p=opened;const stopHit=p.side==='LONG'?low<=p.stop:high>=p.stop;
   const takeHit=p.side==='LONG'?high>=p.take:low<=p.take;
   const timedOut=i-p.at>=maxMinutes;
   if(stopHit||takeHit||timedOut){
    const raw=stopHit?p.stop:takeHit?p.take:open;
    const exit=raw*(p.side==='LONG'?1-slippage:1+slippage);
    const pnl=(exit-p.entry)*p.qty*(p.side==='LONG'?1:-1)-fee*p.qty*(p.entry+exit);
    balance+=pnl;count++;if(pnl>0)wins++;peak=Math.max(peak,balance);
    drawdown=Math.max(drawdown,(peak-balance)/peak*100);opened=null;
   }
  }
  if(!opened&&i<rows.length-1){
   const side=researchSignal(rows.slice(Math.max(0,i-61),i),candidate);
   if(!side)continue;
   const entry=open*(side==='LONG'?1+slippage:1-slippage);
   const qty=feasibleQuantity(symbol,entry,balance,.005,stop,fee);
   if(!qty){skipped++;continue}
   opened={side,entry,qty,stop:entry*(side==='LONG'?1-stop:1+stop),take:entry*(side==='LONG'?1+take:1-take),at:i};
  }
 }
 return {candidate,symbol,bars:rows.length,initial,balance,returnPct:(balance/initial-1)*100,trades:count,wins,skipped,maxDrawdown:drawdown,openAtEnd:Boolean(opened),costs:{feePerSidePct:fee*100,slippagePerSidePct:slippage*100},provisional:rows.length<2880};
}
