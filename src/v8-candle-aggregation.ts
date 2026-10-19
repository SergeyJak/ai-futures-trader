import type {V8Bar} from './v8-liquidity-sweep.js';
/** Aggregate confirmed 1-minute candles on UTC clock boundaries, independent of array offset. */
export function aggregateV8Bars(minute:readonly V8Bar[],timeframeMinutes:5|15):V8Bar[]{
 const interval=timeframeMinutes*60000;
 const groups=new Map<number,V8Bar[]>();
 for(const b of minute){
  const bucket=Math.floor(b.time/interval)*interval;
  const items=groups.get(bucket)??[];
  items.push(b);groups.set(bucket,items);
 }
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).flatMap(([time,items])=>{
  items.sort((a,b)=>a.time-b.time);
  if(items.length!==timeframeMinutes||items.some((b,i)=>b.time!==time+i*60000))return [];
  return [{time,open:items[0].open,high:Math.max(...items.map(b=>b.high)),low:Math.min(...items.map(b=>b.low)),close:items.at(-1)!.close}];
 });
}
