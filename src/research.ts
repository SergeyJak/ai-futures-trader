import {analyze} from './indicators.js';
import type {Bar} from './backtest.js';
export type Candidate='squeeze'|'regime';
export function researchSignal(rows:Bar[],candidate:Candidate):'LONG'|'SHORT'|null{
 if(rows.length<61)return null;
 const recent=rows.slice(-61);
 const closes=recent.map(b=>Number(b.close)),highs=recent.map(b=>Number(b.high)),lows=recent.map(b=>Number(b.low));
 if([...closes,...highs,...lows].some(n=>!Number.isFinite(n)||n<=0))return null;
 const last=closes.at(-1)!;
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
 return {candidate,symbol,rows:rows.length,initial,fee,slippage,stop,take,maxMinutes};
}
