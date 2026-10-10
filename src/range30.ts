type Candle={start_at:string;open:string;high:string;low:string;close:string};
export function researchThirtyMinuteRange(rows:Candle[]){
 const b=rows.map(r=>({at:Date.parse(r.start_at),o:Number(r.open),h:Number(r.high),l:Number(r.low),c:Number(r.close)}));
 const configurations=[5,15,30,60].flatMap(hold=>[.003,.005,.008].map(stop=>({hold,stop,take:stop*2})));
 const result=[];
 for(const cfg of configurations){
  let long=0,short=0,net=0,fees=0,gross=0,slipCost=0,wins=0,count=0;
  for(let i=31;i+cfg.hold<b.length;i++){
   const window=b.slice(i-30,i);
   if(window.length!==30||window.some((x,j)=>j&&x.at-window[j-1].at!==60000))continue;
   const prev=b[i-1],current=b[i],next=b[i+1];
   if(current.at-prev.at!==60000||next.at-current.at!==60000||b[i+cfg.hold].at-next.at!==(cfg.hold-1)*60000)continue;
   const hi=Math.max(...window.map(x=>x.h)),lo=Math.min(...window.map(x=>x.l));
   const side=current.c>hi?'LONG':current.c<lo?'SHORT':null;
   if(!side)continue;
   const direction=side==='LONG'?1:-1;
   const entry=next.o*(1+direction*.0002);
   const stop=entry*(1-direction*cfg.stop),take=entry*(1+direction*cfg.take);
   let raw=b[i+cfg.hold].o;
   for(let j=i+1;j<i+cfg.hold;j++){
    const bar=b[j];
    const hitStop=direction===1?bar.l<=stop:bar.h>=stop;
    const hitTake=direction===1?bar.h>=take:bar.l<=take;
    if(hitStop){raw=direction===1?Math.min(stop,bar.o):Math.max(stop,bar.o);break}
    if(hitTake){raw=direction===1?Math.max(take,bar.o):Math.min(take,bar.o);break}
   }
   const exit=raw*(1-direction*.0002);
   const move=(exit-entry)*direction/entry;
   const fee=.0006*(1+exit/entry);
   const beforeSlip=(raw-next.o)*direction/next.o;
   count++;if(side==='LONG')long++;else short++;
   gross+=move;fees+=fee;net+=move-fee;slipCost+=beforeSlip-move;if(move-fee>0)wins++;
  }
  result.push({holdMinutes:cfg.hold,stopPct:cfg.stop*100,takePct:cfg.take*100,trades:count,long,short,wins,winRate:count?wins/count:null,avgNetPct:count?net/count*100:null,avgGrossAfterSlippagePct:count?gross/count*100:null,avgFeePct:count?fees/count*100:null,avgEstimatedSlippagePct:count?slipCost/count*100:null});
 }
 return {hypothesis:'30 previous completed 1-minute candles define range; breakout if next closed candle closes above high/below low, enter following open; stop has priority if both crossed; conservative OHLC proxy, not executable orders',configurations:result};
}
