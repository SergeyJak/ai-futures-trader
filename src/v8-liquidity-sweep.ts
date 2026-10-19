/** Research-only liquidity sweep/reclaim. Never places orders or changes existing strategies. */
export type V8Bar = { time: number; open: number; high: number; low: number; close: number };
export type V8Side = 'LONG' | 'SHORT';
export type V8Signal = { side: V8Side; at: number; entry: number; stop: number; take: number };
export const V8_FEE_PER_SIDE = 0.0006;
export const V8_SLIPPAGE_PER_SIDE = 0.0003;
export function v8Signal(bars: readonly V8Bar[], lookback = 12, rewardRisk = 2): V8Signal | null {
 if (!Number.isInteger(lookback) || lookback < 3 || !Number.isFinite(rewardRisk) || rewardRisk <= 0 || bars.length < lookback + 1) return null;
 const window = bars.slice(-lookback-1);
 if (window.some((b,i) => !Number.isFinite(b.time) || ![b.open,b.high,b.low,b.close].every(Number.isFinite) || b.low<=0 || b.low>b.high || b.open<b.low || b.open>b.high || b.close<b.low || b.close>b.high || (i>0 && b.time<=window[i-1].time))) return null;
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
export function v8Backtest(bars:readonly V8Bar[], opts:{lookback?:number;holdBars?:number;rewardRisk?:number;fee?:number;slippage?:number}={}){
 const lookback=opts.lookback??12,hold=opts.holdBars??24,fee=opts.fee??V8_FEE_PER_SIDE,slip=opts.slippage??V8_SLIPPAGE_PER_SIDE;
 if (!Number.isInteger(hold)||hold<1||![fee,slip].every(x=>Number.isFinite(x)&&x>=0)) throw new Error('Invalid V8 costs or hold');
 const trades:V8Trade[]=[];
 for(let i=lookback;i<bars.length-1;){
  const signal=v8Signal(bars.slice(i-lookback,i+1),lookback,opts.rewardRisk);
  if(!signal){i++;continue}
  const next=bars[i+1];
  if(next.time-bars[i].time!==bars[i].time-bars[i-1].time){i++;continue}
  const dir=signal.side==='LONG'?1:-1,entry=next.open*(1+dir*slip);
  let exit=entry,reason='TIME',end=i+1;
  for(let j=i+1;j<bars.length&&j<=i+hold;j++){
   const b=bars[j];
   if(j>i+1&&b.time-bars[j-1].time!==bars[j-1].time-bars[j-2].time)break;
   const stop=dir===1?b.low<=signal.stop:b.high>=signal.stop;
   const take=dir===1?b.high>=signal.take:b.low<=signal.take;
   end=j;
   if(stop){exit=dir===1?Math.min(signal.stop,b.open):Math.max(signal.stop,b.open);reason=take?'BOTH_STOP_FIRST':'STOP';break}
   if(take){exit=signal.take;reason='TAKE';break}
   exit=b.close;
  }
  const executionExit=exit*(1-dir*slip);
  trades.push({side:signal.side,signalAt:signal.at,entryAt:next.time,exitAt:bars[end].time,entry,exit:executionExit,netReturnPct:100*(dir*(executionExit/entry-1)-fee*(1+executionExit/entry)),reason});
  i=end+1;
 }
 const net=trades.reduce((s,t)=>s+t.netReturnPct,0);
 return {mode:'historical-research-only',realOrders:false,trades:trades.length,netReturnPctSum:net,averageNetReturnPct:trades.length?net/trades.length:null,winRate:trades.length?trades.filter(t=>t.netReturnPct>0).length/trades.length:null,records:trades};
}
