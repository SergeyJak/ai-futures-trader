import {splitSolHistory,SOL_SPLIT_LABELS,SOL_SPLIT_DATES} from './sol-research-splits.js';
/** Deterministic retrospective opportunity sampling, NOT a predictive trading strategy.
 * A fixed 120-minute entry grid avoids selecting winners by future outcome.
 */
import type {Bar} from './sol-recovery-breakout.js';
export type Opportunity={entryAt:number;exitAt:number;netPct:number;reason:string;drawdown30Pct:number;trend30Pct:number;volumeRatio5:number;realizedVol30Pct:number};
const FEE=.0006,SLIP=.0003;
/** Frozen from discovery winner/loser contrast; no validation/holdout tuning. */
export const SOL_VOLUME_TREND_RULES={minTrend30Pct:.07,minVolumeRatio5:1.35,minDrawdown30Pct:.2,maxDrawdown30Pct:1} as const;
export function isVolumeTrendCandidate(x:Opportunity){return x.trend30Pct>=SOL_VOLUME_TREND_RULES.minTrend30Pct&&x.volumeRatio5>=SOL_VOLUME_TREND_RULES.minVolumeRatio5&&x.drawdown30Pct>=SOL_VOLUME_TREND_RULES.minDrawdown30Pct&&x.drawdown30Pct<=SOL_VOLUME_TREND_RULES.maxDrawdown30Pct}
function median(values:number[]){const a=[...values].sort((x,y)=>x-y);return (a[5]+a[6])/2}
export function sampleSolOpportunities(bars:readonly Bar[]):Opportunity[]{
 const out:Opportunity[]=[];
 for(let i=65;i+121<bars.length;i++){
  if(bars[i].time%(120*60000)!==0)continue;
  const window=bars.slice(i-64,i+121);
  if(window.some((b,k)=>![b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high||b.volume<0||(k>0&&b.time-window[k-1].time!==60000)))continue;
  const last=bars[i],recent30=bars.slice(i-29,i+1);
  const drawdown30Pct=100*(1-last.close/Math.max(...recent30.map(b=>b.high)));
  const trend30Pct=100*(last.close/recent30[0].close-1);
  const previous5Volumes=Array.from({length:12},(_,j)=>bars.slice(i-64+j*5,i-59+j*5).reduce((s,b)=>s+b.volume,0));
  const med=median(previous5Volumes),volumeRatio5=med>0?bars.slice(i-4,i+1).reduce((s,b)=>s+b.volume,0)/med:0;
  let sum=0;for(let j=1;j<recent30.length;j++)sum+=Math.log(recent30[j].close/recent30[j-1].close)**2;
  const realizedVol30Pct=100*Math.sqrt(sum);
  const next=bars[i+1],entry=next.open*(1+SLIP),stop=entry*.992,take=entry*1.016;
  let exit=next.close,reason='TIME',end=i+120;
  for(let j=i+1;j<=i+120;j++){
   const b=bars[j];
   if(b.low<=stop){exit=Math.min(stop,b.open);reason='STOP';end=j;break}
   if(b.high>=take){exit=take;reason='TAKE';end=j;break}
   exit=b.close;
  }
  const executionExit=exit*(1-SLIP),netPct=100*(executionExit/entry-1-FEE*(1+executionExit/entry));
  out.push({entryAt:next.time,exitAt:bars[end].time,netPct,reason,drawdown30Pct,trend30Pct,volumeRatio5,realizedVol30Pct});
 }
 return out;
}
function summary(rows:readonly Opportunity[]){
 let equity=100,peak=100,dd=0;
 for(const t of rows){equity+=t.netPct*.1;peak=Math.max(peak,equity);dd=Math.max(dd,100*(peak-equity)/peak)}
 const n=rows.length,netPnlUsdt=rows.reduce((s,t)=>s+t.netPct*.1,0),mean=n?netPnlUsdt/n:null;
 const variance=n>1?rows.reduce((s,t)=>s+(t.netPct*.1-(mean??0))**2,0)/(n-1):null;
 const margin=variance===null?null:1.96*Math.sqrt(variance/n);
 return {trades:n,wins:rows.filter(x=>x.netPct>0).length,netPnlUsdt,maxDrawdownPct:dd,meanNetPnlUsdt:mean,approx95MeanCiUsdt:margin===null||mean===null?null:[mean-margin,mean+margin]};
}
const FEATURES=['drawdown30Pct','trend30Pct','volumeRatio5','realizedVol30Pct'] as const;
function featureMedian(rows:readonly Opportunity[]){
 return Object.fromEntries(FEATURES.map(k=>{const v=rows.map(x=>x[k]).sort((a,b)=>a-b);return [k,v.length?v[Math.floor(v.length/2)]:null]}));
}
export function evaluateSolOpportunities(bars:readonly Bar[]){
 const splits=splitSolHistory(bars).map((segment,i)=>{
  const rows=sampleSolOpportunities(segment),s=summary(rows),candidate=summary(rows.filter(isVolumeTrendCandidate));
  if(i!==0)return {split:SOL_SPLIT_LABELS[i],...s,candidate};
  const winners=rows.filter(x=>x.netPct>0).sort((x,y)=>y.netPct-x.netPct).slice(0,20);
  const losers=rows.filter(x=>x.netPct<0).sort((x,y)=>x.netPct-y.netPct).slice(0,20);
  return {split:'discovery',...s,candidate,top20Winners:winners,bottom20Losers:losers,featureMedians:{winners:featureMedian(winners),losers:featureMedian(losers)},warning:'Retrospective examples only. No candidate threshold is selected from validation or holdout.'};
 });
 const holdout=splits[3],c=holdout.candidate;
 const candidateDecision=c.trades<30?'INSUFFICIENT_HOLDOUT':c.netPnlUsdt<=0?'REJECT_NEGATIVE_NET':(c.approx95MeanCiUsdt?.[0]??-Infinity)<=0?'INCONCLUSIVE':'CANDIDATE_BEFORE_FUNDING';
 return {mode:'retrospective-fixed-grid-entry-contrast',symbol:'SOLUSDT',realOrders:false,notionalUsdt:10,feeAndSlippageIncluded:true,fundingIncluded:false,gridMinutes:120,holdMinutes:120,gridAnchor:'even UTC hours',splitDates:SOL_SPLIT_DATES,retrospectiveAlreadyInspected:true,candidateRules:SOL_VOLUME_TREND_RULES,candidateDecision,splits};
}
