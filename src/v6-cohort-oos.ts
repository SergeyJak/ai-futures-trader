import {DEFAULT_OOS_CONFIG,scoreClosedTrade,summarizeReturns,type BacktestConfig,type CompletedTrade,type Pattern,type ScoredTrade} from './v6-oos-backtest.js';

export type ClosedPositionMeta={id:string;traderId:string;openedMs:number;closedMs:number};
export type CohortEntry=CompletedTrade&{traderId:string};
export type HoldingStyle='intraday'|'swing'|'multiday';
const PATTERNS:Pattern[]=['dip_reversal','dip_continuation','momentum_continuation','momentum_pullback'];
const STYLES:HoldingStyle[]=['intraday','swing','multiday'];
const MIN_CLOSED_PER_TRADER=5;
const MIN_TRAIN_PATTERN=8;
const MIN_TEST_PATTERN=10;
const MIN_TEST_TRADERS=2;
const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.floor((s.length-1)/2)]};
export function trainingOnlyHoldingStyles(closed:ClosedPositionMeta[],testStartMs:number):Map<string,HoldingStyle>{
 const by=new Map<string,number[]>();
 for(const p of closed){
  if(!p.traderId||!Number.isFinite(p.openedMs)||!Number.isFinite(p.closedMs)||p.openedMs>=p.closedMs||p.closedMs>=testStartMs)continue;
  const xs=by.get(p.traderId)??[];xs.push((p.closedMs-p.openedMs)/3600000);by.set(p.traderId,xs);
 }
 const styles=new Map<string,HoldingStyle>();
 for(const [id,hours] of by){
  if(hours.length<MIN_CLOSED_PER_TRADER)continue;
  const h=median(hours);styles.set(id,h<4?'intraday':h<48?'swing':'multiday');
 }
 return styles;
}
function riskReward(rows:ScoredTrade[]){
 const wins=rows.filter(r=>r.netReturn>0).map(r=>r.netReturn),losses=rows.filter(r=>r.netReturn<0).map(r=>-r.netReturn);
 return {meanWin:wins.length?wins.reduce((a,b)=>a+b,0)/wins.length:null,
 meanLossMagnitude:losses.length?losses.reduce((a,b)=>a+b,0)/losses.length:null,
 realizedRewardRisk:wins.length&&losses.length?(wins.reduce((a,b)=>a+b,0)/wins.length)/(losses.reduce((a,b)=>a+b,0)/losses.length):null,
 worstNetReturn:rows.length?Math.min(...rows.map(r=>r.netReturn)):null};
}
/** Research only. Classify traders using positions closed BEFORE the test boundary.
 * Use all closed positions to classify holding style, including those missing entry candles.
 * Select a pattern on training data alone. No real orders, no forward execution claim.
 */
export function evaluateV6CohortHoldout(allClosed:ClosedPositionMeta[],entryEligible:CohortEntry[],config:BacktestConfig=DEFAULT_OOS_CONFIG){
 if(!(config.trainFraction>0&&config.trainFraction<1))throw Error('Invalid train fraction');
 const seen=new Set<string>();
 const ordered=[...allClosed].filter(p=>p.traderId&&Number.isFinite(p.openedMs)&&Number.isFinite(p.closedMs)&&p.closedMs>p.openedMs)
  .sort((a,b)=>a.openedMs-b.openedMs||a.id.localeCompare(b.id))
  .filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true});
 const testStartMs=ordered[Math.floor(ordered.length*config.trainFraction)]?.openedMs;
 if(testStartMs===undefined)return {status:'insufficient_data' as const,reason:'No closed-position chronological split',closedCount:ordered.length};
 const styles=trainingOnlyHoldingStyles(ordered,testStartMs);
 const validIds=new Set(ordered.map(p=>p.id)),used=new Set<string>();
 const eligible=entryEligible.filter(t=>{
  if(!validIds.has(t.id)||used.has(t.id)||!styles.has(t.traderId))return false;
  used.add(t.id);return true;
 });
 const results=STYLES.map(style=>{
  const ids=[...styles].filter(([,v])=>v===style).map(([id])=>id);
  const group=eligible.filter(t=>styles.get(t.traderId)===style);
  const train=group.filter(t=>t.openedMs<testStartMs&&t.closedMs<testStartMs).map(t=>scoreClosedTrade(t,config));
  const test=group.filter(t=>t.openedMs>=testStartMs).map(t=>scoreClosedTrade(t,config));
  const candidates=PATTERNS.map(pattern=>({pattern,rows:train.filter(t=>t.pattern===pattern)}))
   .filter(x=>x.rows.length>=MIN_TRAIN_PATTERN)
   .sort((a,b)=>(summarizeReturns(b.rows).meanNetReturn??-Infinity)-(summarizeReturns(a.rows).meanNetReturn??-Infinity)||a.pattern.localeCompare(b.pattern));
  const selected=candidates[0];
  const holdout=selected?test.filter(t=>t.pattern===selected.pattern):[];
  const testTraders=new Set(holdout.map(t=>t.traderId)).size;
  const sufficient=Boolean(selected&&holdout.length>=MIN_TEST_PATTERN&&testTraders>=MIN_TEST_TRADERS);
  return {style,tradersClassified:ids.length,trainEligible:train.length,testEligible:test.length,
   selectedPattern:selected?.pattern??null,selectedTrainCount:selected?.rows.length??0,
   selectedTestCount:holdout.length,selectedTestTraders:testTraders,
   status:sufficient?'exploratory_evaluated' as const:'insufficient_data' as const,
   train:sufficient?summarizeReturns(selected!.rows):null,
   test:sufficient?summarizeReturns(holdout):null,
   testRiskReward:sufficient?riskReward(holdout):null,
   baselineTest:sufficient?summarizeReturns(test):null,
   reason:sufficient?null:'Requires >=8 train observations for a pattern, >=10 test observations and >=2 distinct test traders'};
 });
 return {status:'descriptive_research' as const,closedCount:ordered.length,eligibleEntryPatterns:eligible.length,
  holdoutStartMs:testStartMs,trainingClassifiedTraders:styles.size,
  excludedUnclassifiedOrMissingEntry:ordered.length-eligible.length,
  config:{...config,minClosedPerTrader:MIN_CLOSED_PER_TRADER,minTrainPattern:MIN_TRAIN_PATTERN,minTestPattern:MIN_TEST_PATTERN,minTestTraders:MIN_TEST_TRADERS},
  styles:results,
  warning:'Retrospective rolling 70/30 split. Recovered candles can change sample and boundary; do not treat repeated runs as untouched OOS. Cohorts use training-only closed trades. Observed trader fills are not executable signals; fees/slippage are assumptions and funding is excluded.'};
}
