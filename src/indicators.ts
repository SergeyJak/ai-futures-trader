export type Bar={close:string|number;volume:string|number};
export function ema(values:number[],period:number):number|null{
 if(values.length<period||!Number.isInteger(period)||period<2)return null;
 const alpha=2/(period+1);
 let current=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
 for(let i=period;i<values.length;i++)current=values[i]*alpha+current*(1-alpha);
 return current;
}
export function rsi(values:number[],period=14):number|null{
 if(values.length<=period)return null;
 let gain=0,loss=0;
 for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0)}
 gain/=period;loss/=period;
 for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period}
 if(loss===0)return gain===0?50:100;
 return 100-100/(1+gain/loss);
}
export function analyze(bars:Bar[]){
 const prices=bars.map(b=>Number(b.close)),volumes=bars.map(b=>Number(b.volume));
 if(prices.some(v=>!Number.isFinite(v)||v<=0)||volumes.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid market bar');
 const fast=ema(prices,9),slow=ema(prices,21),strength=rsi(prices);
 const recent=volumes.at(-1)??0;
 const baseline=volumes.length>=21?volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20:null;
 const volumeRatio=baseline&&baseline>0?recent/baseline:null;
 const signal=fast===null||slow===null||strength===null||volumeRatio===null?'INSUFFICIENT_DATA':
  fast>slow&&strength>=52&&strength<70&&volumeRatio>=1.2?'BULLISH_WATCH':
  fast<slow&&strength<=48&&strength>30&&volumeRatio>=1.2?'BEARISH_WATCH':'NEUTRAL';
 return {ema9:fast,ema21:slow,rsi14:strength,volumeRatio,signal};
}
