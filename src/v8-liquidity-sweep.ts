/** Research-only liquidity sweep/reclaim. Never places orders or changes existing strategies. */
export type V8Bar = { time: number; open: number; high: number; low: number; close: number };
export type V8Side = 'LONG' | 'SHORT';
export type V8Signal = { side: V8Side; at: number; entry: number; stop: number; take: number };
export const V8_FEE_PER_SIDE = 0.0006;
export const V8_SLIPPAGE_PER_SIDE = 0.0003;
export function v8Signal(bars: readonly V8Bar[], lookback = 12, rewardRisk = 2, expectedIntervalMs?: number): V8Signal | null {
 if (!Number.isInteger(lookback) || lookback < 3 || !Number.isFinite(rewardRisk) || rewardRisk <= 0 || bars.length < lookback + 1) return null;
 const window = bars.slice(-lookback-1);
 const intervalMs = expectedIntervalMs ?? (window[1].time - window[0].time);
 if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) return null;
 if (window.some((b,i) => !Number.isFinite(b.time) || ![b.open,b.high,b.low,b.close].every(Number.isFinite) || b.low<=0 || b.low>b.high || b.open<b.low || b.open>b.high || b.close<b.low || b.close>b.high || (i>0 && b.time-window[i-1].time!==intervalMs))) return null;
 const prior=window.slice(0,-1), last=window.at(-1)!;
 const low=Math.min(...prior.map(b=>b.low)), high=Math.max(...prior.map(b=>b.high));
 const long=last.low<low && last.close>low && last.close>last.open;
 const short=last.high>high && last.close<high && last.close<last.open;
 if (long===short) return null;
 const side=long?'LONG':'SHORT', entry=last.close, stop=long?last.low:last.high;
 const risk=Math.abs(entry-stop);
 if (risk/entry<0.0002 || risk/entry>0.03) return null;
 return {side,at:last.time,entry,stop,take:long?entry+risk*rewardRisk:entry-risk*rewardRisk};
}
export type V8Trade={side:V8Side;signalAt:number;entryAt:number;exitAt:number;entry:number;exit:number;netReturnPct:number;reason:string};
export function v8Backtest(bars:readonly V8Bar[], opts:{lookback?:number;holdBars?:number;holdMinutes?:number;rewardRisk?:number;fee?:number;slippage?:number;expectedBarMinutes?:number}={}){
 const lookback=opts.lookback??12,holdBars=opts.holdBars,holdMinutes=opts.holdMinutes??24*60,fee=opts.fee??V8_FEE_PER_SIDE,slip=opts.slippage??V8_SLIPPAGE_PER_SIDE;
 const expectedIntervalMs=opts.expectedBarMinutes===undefined?undefined:opts.expectedBarMinutes*60000;
 if ((holdBars!==undefined&&(!Number.isInteger(holdBars)||holdBars<1||opts.holdMinutes!==undefined))||!Number.isInteger(holdMinutes)||holdMinutes<1||![fee,slip].every(x=>Number.isFinite(x)&&x>=0)||(opts.expectedBarMinutes!==undefined&&(!Number.isSafeInteger(opts.expectedBarMinutes)||opts.expectedBarMinutes<=0))) throw new Error('Invalid V8 costs or hold');
 const trades:V8Trade[]=[];
 for(let i=lookback;i<bars.length-1;){
  const signal=v8Signal(bars.slice(i-lookback,i+1),lookback,opts.rewardRisk,expectedIntervalMs);
  if(!signal){i++;continue}
  const next=bars[i+1];
  if(next.time-bars[i].time!==bars[i].time-bars[i-1].time||(expectedIntervalMs!==undefined&&next.time-bars[i].time!==expectedIntervalMs)){i++;continue}
  const dir=signal.side==='LONG'?1:-1,entry=next.open*(1+dir*slip);
  let exit=entry,reason='TIME',end=i+1,closed=false;
  for(let j=i+1;j<bars.length;j++){
   const b=bars[j];
   if(j>i+1&&(b.time-bars[j-1].time!==bars[j-1].time-bars[j-2].time||(expectedIntervalMs!==undefined&&b.time-bars[j-1].time!==expectedIntervalMs)))break;
   const stop=dir===1?b.low<=signal.stop:b.high>=signal.stop;
   const take=dir===1?b.high>=signal.take:b.low<=signal.take;
   end=j;
   if(stop){exit=dir===1?Math.min(signal.stop,b.open):Math.max(signal.stop,b.open);reason=take?'BOTH_STOP_FIRST':'STOP';closed=true;break}
   if(take){exit=signal.take;reason='TAKE';closed=true;break}
   exit=b.close;
   if(holdBars!==undefined?j>=i+holdBars:b.time-next.time>=holdMinutes*60000){closed=true;break}
  }
  // An open position at the dataset boundary (or a candle gap) is not a realized trade.
  if(!closed){i=end+1;continue}
  const executionExit=exit*(1-dir*slip);
  trades.push({side:signal.side,signalAt:signal.at,entryAt:next.time,exitAt:bars[end].time,entry,exit:executionExit,netReturnPct:100*(dir*(executionExit/entry-1)-fee*(1+executionExit/entry)),reason});
  i=end+1;
 }
 const net=trades.reduce((s,t)=>s+t.netReturnPct,0);
 return {mode:'historical-research-only',realOrders:false,trades:trades.length,netReturnPctSum:net,averageNetReturnPct:trades.length?net/trades.length:null,winRate:trades.length?trades.filter(t=>t.netReturnPct>0).length/trades.length:null,records:trades};
}
