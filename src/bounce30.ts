type Candle={start_at:string;open:string;high:string;low:string;close:string};
type Bar={ms:number;open:number;high:number;low:number;close:number};
function evaluate(b:Bar[],dip:number,stop:number,take:number,side:'LONG'|'SHORT'){
 let trades=0,wins=0,gross=0,fees=0,net=0,stops=0,takes=0,times=0;
 const direction=side==='LONG'?1:-1;
 for(let i=30;i+31<b.length;i++){
  const window=b.slice(i-30,i);
  if(window.some((x,j)=>j>0&&x.ms-window[j-1].ms!==60000))continue;
  if(b[i].ms-b[i-1].ms!==60000||b[i+1].ms-b[i].ms!==60000)continue;
  const peak=Math.max(...window.map(x=>x.high));
  // Enter when the minute candle first touches the drawdown threshold. Minute OHLC
  // does not reveal the intrabar path; treat this as a threshold-touch approximation.
  const trigger=peak*(1-dip);
  if(b[i-1].close<=trigger||b[i].low>trigger||b[i].open<trigger)continue;
  const marketEntry=trigger,entry=marketEntry*(1+direction*.0002);
  const stopPrice=entry*(1-direction*stop),takePrice=entry*(1+direction*take);
  let raw=0,reason='TIME',valid=true;
  // Exit at the first minute open after 30 minutes, unless a stop or target triggers sooner.
  for(let j=i+1;j<=i+31;j++){
   const candle=b[j];if(candle.ms-b[j-1].ms!==60000){valid=false;break}
   if(j===i+31){raw=candle.open;break}
   const stopHit=direction===1?candle.low<=stopPrice:candle.high>=stopPrice;
   const takeHit=direction===1?candle.high>=takePrice:candle.low<=takePrice;
   if(stopHit){raw=direction===1?Math.min(candle.open,stopPrice):Math.max(candle.open,stopPrice);reason='STOP';break}
   if(takeHit){raw=direction===1?Math.max(candle.open,takePrice):Math.min(candle.open,takePrice);reason='TAKE';break}
  }
  if(!valid||!raw)continue;
  const exit=raw*(1-direction*.0002);
  const rawReturn=(exit-entry)*direction/entry;
  const costs=.0006*(1+exit/entry);
  trades++;gross+=rawReturn;fees+=costs;net+=rawReturn-costs;if(rawReturn>costs)wins++;
  if(reason==='STOP')stops++;else if(reason==='TAKE')takes++;else times++;
  // Single-position conservative comparison. No overlapping entries.
  i+=30;
 }
 return {side,trades,wins,winRate:trades?wins/trades:null,avgGrossAfterSlippagePct:trades?100*gross/trades:null,avgFeesPct:trades?100*fees/trades:null,avgNetPct:trades?100*net/trades:null,totalNetPct:100*net,exits:{stop:stops,take:takes,time:times}};
}
export function researchThirtyMinuteBounce(rows:Candle[]){
 const b=rows.map(x=>({ms:Date.parse(x.start_at),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 const results=[];
 for(const dip of [.002,.004,.006])
  for(const stop of [.002,.004,.006])
   for(const take of [.003,.006,.009]){
    const long=evaluate(b,dip,stop,take,'LONG'),short=evaluate(b,dip,stop,take,'SHORT');
    results.push({dipPct:dip*100,stopPct:stop*100,takePct:take*100,maxMinutes:30,long,short});
   }
 return {type:'research-only',hypothesis:'Entry is modeled at the instant a minute candle touches the specified drawdown from the previous 30-minute high (without rebound confirmation). Minute OHLC cannot reconstruct exact intrabar sequence, so entry-candle exits are not simulated, a known optimistic limitation. Both directions share the same trigger; stop/target or 30-minute exit. Research only.',results};
}
