import {DEFAULT_OOS_CONFIG,scoreClosedTrade,summarizeReturns,type CompletedTrade,type Pattern,type BacktestConfig} from './v6-oos-backtest.js';

/** Fixed calendar boundary. Research only: historical copytrader fills, NOT executable paper trading.
 * Cutoff is immutable so newly backfilled historical rows cannot move the test start.
 * The selected pattern is provisional until training data is frozen.
 */
export const V6_FIXED_CUTOFF_MS=Date.parse('2026-10-15T00:00:00.000Z');
export function fixedCalendarHoldout(trades:CompletedTrade[],cutoffMs=V6_FIXED_CUTOFF_MS,nowMs=Date.now(),config:BacktestConfig=DEFAULT_OOS_CONFIG){
 if(!Number.isFinite(cutoffMs)||!Number.isFinite(nowMs)||cutoffMs<=0||config.minimumTrain<1||config.minimumTest<1)throw Error('Invalid fixed holdout config');
 const unique=new Map<string,CompletedTrade>();
 for(const t of trades)if(!unique.has(t.id))unique.set(t.id,t);
 const rows=[...unique.values()].filter(t=>t.openedMs<=nowMs&&t.closedMs<=nowMs);
 const train=rows.filter(t=>t.openedMs<cutoffMs&&t.closedMs<cutoffMs).map(t=>scoreClosedTrade(t,config));
 const future=rows.filter(t=>t.openedMs>=cutoffMs).map(t=>scoreClosedTrade(t,config));
 const overlap=rows.filter(t=>t.openedMs<cutoffMs&&t.closedMs>=cutoffMs).length;
 const base={cutoffAt:new Date(cutoffMs).toISOString(),trainCount:train.length,testCount:future.length,purgedOverlapping:overlap,mode:'fixed-calendar-observational',realOrders:false,warning:'Copytrader fills, not independently executable signals. Historical backfill can change the training pattern until it is frozen; no prospective profitability claim.'};
 if(train.length<config.minimumTrain)return {...base,status:'insufficient_training' as const};
 const patterns:Pattern[]=['dip_reversal','dip_continuation','momentum_continuation','momentum_pullback'];
 const candidates=patterns.map(pattern=>({pattern,stats:summarizeReturns(train.filter(t=>t.pattern===pattern))})).filter(x=>x.stats.count>=Math.max(5,Math.floor(config.minimumTrain/4)));
 if(!candidates.length)return {...base,status:'insufficient_training' as const};
 candidates.sort((a,b)=>(b.stats.meanNetReturn??-Infinity)-(a.stats.meanNetReturn??-Infinity)||a.pattern.localeCompare(b.pattern));
 const selected=candidates[0].pattern,selectedTrain=candidates[0].stats,selectedTest=summarizeReturns(future.filter(t=>t.pattern===selected));
 if(nowMs<cutoffMs||future.length<config.minimumTest||selectedTest.count<config.minimumTest)return {...base,status:'awaiting_future_trades' as const,selectedPattern:selected,train:selectedTrain,selectedPatternTestCount:selectedTest.count,minimumTest:config.minimumTest};
 return {...base,status:'evaluated_observational' as const,selectedPattern:selected,train:selectedTrain,test:selectedTest,baselineTest:summarizeReturns(future),config};
}
