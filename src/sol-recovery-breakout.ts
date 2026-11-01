export type Bar={time:number;open:number;high:number;low:number;close:number;volume:number};
export type Trade={entryAt:number;exitAt:number;netPct:number;reason:string};
export function recoveryBacktest(bars:readonly Bar[]):Trade[]{
 const out:Trade[]=[];
 for(let i=65;i<bars.length-121;){
  const h=bars.slice(i-65,i+2);
  if(h.some((b,k)=>![b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high||b.volume<0||(k>0&&b.time-h[k-1].time!==60000))){i++;continue}
  const dip=1-bars[i].close/Math.max(...bars.slice(i-29,i+1).map(b=>b.high));
  const reclaim=bars[i].close>Math.max(...bars.slice(i-9,i-4).map(b=>b.high));
  const volumes=Array.from({length:12},(_,j)=>bars.slice(i-64+j*5,i-59+j*5).reduce((s,b)=>s+b.volume,0)).sort((a,b)=>a-b);
  const median=(volumes[5]+volumes[6])/2;
  const recent=bars.slice(i-4,i+1).reduce((s,b)=>s+b.volume,0);
  if(dip<0.015||!reclaim||median<=0||recent<median*1.5){i++;continue}
  const entry=bars[i+1].open*1.0003,stop=entry*0.992,take=entry*1.016;
  let done=false;
  for(let j=i+1;j<=i+120;j++){
   const b=bars[j];
   if(j>i+1&&b.time-bars[j-1].time!==60000)break;
   const stopHit=b.low<=stop,takeHit=b.high>=take;
   if(stopHit||takeHit||j===i+120){
    const raw=stopHit?Math.min(stop,b.open):takeHit?take:b.close;
    const exit=raw*0.9997;
    out.push({entryAt:bars[i+1].time,exitAt:b.time,netPct:100*(exit/entry-1-0.0006*(1+exit/entry)),reason:stopHit?'STOP':takeHit?'TAKE':'TIME'});
    i=j+1;done=true;break;
   }
  }
  if(!done)i+=121;
 }
 return out;
}
