/** Research-only, pre-registered chronological holdout. Never used to place orders. */
export type Pattern='dip_reversal'|'dip_continuation'|'momentum_continuation'|'momentum_pullback';
export type CompletedTrade={id:string;openedMs:number;closedMs:number;pattern:Pattern;side:'LONG'|'SHORT';entry:number;exit:number};
export type ScoredTrade=CompletedTrade&{netReturn:number};
export type BacktestConfig={feePerSide:number;slippagePerSide:number;trainFraction:number;minimumTrain:number;minimumTest:number};
export const DEFAULT_OOS_CONFIG:BacktestConfig={feePerSide:0.0006,slippagePerSide:0.0003,trainFraction:0.7,minimumTrain:30,minimumTest:15};
export function scoreClosedTrade(t:CompletedTrade,config:BacktestConfig=DEFAULT_OOS_CONFIG):ScoredTrade{
 if(!Number.isFinite(t.entry)||!Number.isFinite(t.exit)||t.entry<=0||t.exit<=0||t.closedMs<=t.openedMs)throw Error('Invalid closed trade');
 const direction=t.side==='LONG'?1:t.side==='SHORT'?-1:0;
 if(!direction)throw Error('Invalid side');
 const gross=direction*(t.exit/t.entry-1);
 return {...t,netReturn:gross-2*(config.feePerSide+config.slippagePerSide)};
}
export function summarizeReturns(rows:ScoredTrade[]){
 const returns=rows.map(r=>r.netReturn);
 const wins=returns.filter(x=>x>0);
 const losses=returns.filter(x=>x<0);
 const gain=wins.reduce((a,b)=>a+b,0);
 const loss=-losses.reduce((a,b)=>a+b,0);
 return {count:rows.length,winRate:rows.length?wins.length/rows.length:null,meanNetReturn:rows.length?returns.reduce((a,b)=>a+b,0)/rows.length:null,profitFactor:loss>0?gain/loss:null,medianHoldMinutes:rows.length?[...rows].map(x=>(x.closedMs-x.openedMs)/60000).sort((a,b)=>a-b)[Math.floor((rows.length-1)/2)]:null};
}
/** Split by entry time, purge trades overlapping the test period, select ONLY on training.
 * The holdout is reported once, with no parameter tuning based on its outcome.
 */
export function chronologicalHoldout(trades:CompletedTrade[],config:BacktestConfig=DEFAULT_OOS_CONFIG){
 if(!(config.trainFraction>0&&config.trainFraction<1)||config.minimumTrain<1||config.minimumTest<1||config.feePerSide<0||config.slippagePerSide<0)throw Error('Invalid OOS config');
 const seen=new Set<string>();
 const ordered=[...trades].sort((a,b)=>a.openedMs-b.openedMs||a.id.localeCompare(b.id)).filter(t=>{
  if(seen.has(t.id))return false;
  seen.add(t.id);return true;
 });
 const split=Math.floor(ordered.length*config.trainFraction);
 const testStart=ordered[split]?.openedMs;
 if(testStart===undefined)return {status:'insufficient_data' as const,trainCount:0,testCount:0,reason:'No chronological holdout'};
 const train=ordered.slice(0,split).filter(t=>t.closedMs<testStart).map(t=>scoreClosedTrade(t,config));
 const test=ordered.slice(split).map(t=>scoreClosedTrade(t,config));
 if(train.length<config.minimumTrain||test.length<config.minimumTest)return {status:'insufficient_data' as const,trainCount:train.length,testCount:test.length,reason:'Not enough non-overlapping closed trades'};
 const patterns:Pattern[]=['dip_reversal','dip_continuation','momentum_continuation','momentum_pullback'];
 const trainByPattern=patterns.map(pattern=>({pattern,stats:summarizeReturns(train.filter(t=>t.pattern===pattern))}));
 const eligible=trainByPattern.filter(x=>x.stats.count>=Math.max(5,Math.floor(config.minimumTrain/4)));
 if(!eligible.length)return {status:'insufficient_data' as const,trainCount:train.length,testCount:test.length,reason:'Not enough training examples per pattern'};
 eligible.sort((a,b)=>(b.stats.meanNetReturn??-Infinity)-(a.stats.meanNetReturn??-Infinity));
 const selected=eligible[0].pattern;
 const holdout=test.filter(t=>t.pattern===selected);
 if(holdout.length<config.minimumTest)return {status:'insufficient_data' as const,selectedPattern:selected,trainCount:train.length,testCount:test.length,selectedPatternTestCount:holdout.length,reason:'Not enough out-of-sample closed trades for the selected pattern'};
 return {status:'evaluated' as const,selectedPattern:selected,trainCount:train.length,testCount:test.length,train:summarizeReturns(train.filter(t=>t.pattern===selected)),test:summarizeReturns(holdout),baselineTest:summarizeReturns(test),holdoutStartMs:testStart,config,warning:'Observational copied entries, not independently executable signals; no claim of live profitability.'};
}
