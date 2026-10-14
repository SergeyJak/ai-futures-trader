import {DEFAULT_OOS_CONFIG,scoreClosedTrade,summarizeReturns,type CompletedTrade,type Pattern} from './v6-oos-backtest.js';

export const FIXED_V6_CUTOFF=Date.parse('2026-10-15T00:00:00Z');
export type ObservedTrade=CompletedTrade&{observedAtMs:number};
const PATTERNS:Pattern[]=['dip_reversal','dip_continuation','momentum_continuation','momentum_pullback'];

/** Forward validation: only information observed before cutoff may select a pattern. */
export function fixedForwardAssessment(rows:ObservedTrade[],nowMs=Date.now()){
 const cutoff=FIXED_V6_CUTOFF;
 if(nowMs<cutoff)return {status:'awaiting_cutoff' as const,cutoff:new Date(cutoff).toISOString()};
 const cfg=DEFAULT_OOS_CONFIG;
 const latest=new Map<string,ObservedTrade>();
 for(const row of rows){
  if(!Number.isFinite(row.observedAtMs)||row.observedAtMs>nowMs)continue;
  const isTrain=row.openedMs<cutoff;
  if(isTrain&&(row.closedMs>=cutoff||row.observedAtMs>=cutoff))continue;
  if(!isTrain&&(row.observedAtMs<cutoff||row.closedMs>nowMs))continue;
  const old=latest.get(row.id);
  if(!old||row.observedAtMs>old.observedAtMs)latest.set(row.id,row);
 }
 const unique=[...latest.values()];
 const train=unique.filter(t=>t.openedMs<cutoff).map(t=>scoreClosedTrade(t,cfg));
 const test=unique.filter(t=>t.openedMs>=cutoff).map(t=>scoreClosedTrade(t,cfg));
 if(train.length<cfg.minimumTrain)return {status:'insufficient_data' as const,reason:'Not enough pre-cutoff training trades',trainCount:train.length,testCount:test.length};
 const ranked=PATTERNS.map(pattern=>({pattern,stats:summarizeReturns(train.filter(t=>t.pattern===pattern))}))
  .filter(x=>x.stats.count>=Math.max(5,Math.floor(cfg.minimumTrain/4)))
  .sort((a,b)=>(b.stats.meanNetReturn??-Infinity)-(a.stats.meanNetReturn??-Infinity)||a.pattern.localeCompare(b.pattern));
 if(!ranked.length)return {status:'insufficient_data' as const,reason:'No eligible training pattern',trainCount:train.length,testCount:test.length};
 const selectedPattern=ranked[0].pattern,selectedTest=test.filter(t=>t.pattern===selectedPattern);
 if(selectedTest.length<cfg.minimumTest)return {status:'insufficient_data' as const,reason:'Not enough forward trades of selected pattern',selectedPattern,selectedPatternTestCount:selectedTest.length,trainCount:train.length,testCount:test.length};
 return {status:'evaluated' as const,cutoff:new Date(cutoff).toISOString(),selectedPattern,trainCount:train.length,testCount:test.length,training:summarizeReturns(train.filter(t=>t.pattern===selectedPattern)),forward:summarizeReturns(selectedTest),allForward:summarizeReturns(test),costs:cfg,warning:'Historical trader fills, not executable signals. Results do not establish live profitability.'};
}
