import {DEFAULT_OOS_CONFIG,scoreClosedTrade,summarizeReturns,type CompletedTrade,type BacktestConfig} from './v6-oos-backtest.js';
export const HOLD_WINDOWS_HOURS=[48,72,168] as const;
/** Observed trader holding durations, NOT simulated 48h/72h/7d exits. */
export function observedHoldingWindowStudy(trades:CompletedTrade[],config:BacktestConfig=DEFAULT_OOS_CONFIG){
 const seen=new Set<string>();
 const sorted=[...trades].sort((a,b)=>a.openedMs-b.openedMs||a.id.localeCompare(b.id)).filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true});
 const split=Math.floor(sorted.length*config.trainFraction),testStart=sorted[split]?.openedMs;
 if(testStart===undefined)return {status:'insufficient_data' as const,reason:'No holdout',total:sorted.length};
 const training=sorted.slice(0,split).filter(t=>t.closedMs<testStart);
 const holdout=sorted.slice(split);
 const windows=HOLD_WINDOWS_HOURS.map(hours=>{
  const select=(xs:CompletedTrade[])=>xs.filter(t=>(t.closedMs-t.openedMs)>=hours*3600000);
  const train=select(training).map(t=>scoreClosedTrade(t,config));
  const test=select(holdout).map(t=>scoreClosedTrade(t,config));
  return {minimumObservedHoldHours:hours,train:summarizeReturns(train),test:summarizeReturns(test),
   sufficientSample:train.length>=config.minimumTrain&&test.length>=config.minimumTest};
 });
 return {status:'descriptive_only' as const,total:sorted.length,trainCount:training.length,testCount:holdout.length,holdoutStartMs:testStart,windows,
  limitations:'Only naturally closed trader positions. Selection by realized duration is known only after exit and introduces hindsight bias. No fixed-time exits, funding, intratrade drawdown or executable forward strategy validated. Fees/slippage hypothetical.'};
}
