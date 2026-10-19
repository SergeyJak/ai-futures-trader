import type {V8Bar} from './v8-liquidity-sweep.js';
import {aggregateConfirmed5m} from './sol-5m-paper.js';

/** Convert confirmed 1m bars into complete, clock-aligned 5m or 15m candles. */
export function confirmedV8Bars(bars:V8Bar[],minutes:5|15):V8Bar[]{
 const five=aggregateConfirmed5m(bars);
 if(minutes===5)return five;
 const grouped=new Map<number,V8Bar[]>();
 for(const bar of five){
  const start=Math.floor(bar.time/900000)*900000;
  grouped.set(start,[...(grouped.get(start)??[]),bar]);
 }
 return [...grouped.entries()].sort((a,b)=>a[0]-b[0]).flatMap(([time,g])=>{
  g.sort((a,b)=>a.time-b.time);
  if(g.length!==3||g.some((b,i)=>b.time!==time+i*300000))return [];
  return [{time,open:g[0].open,high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),close:g[2].close}];
 });
}
