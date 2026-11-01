import {splitSolHistory,SOL_SPLIT_LABELS,SOL_SPLIT_DATES} from './sol-research-splits.js';
import {evaluateSolOpportunities} from './sol-entry-opportunity-study.js';
import type pg from 'pg';
import {recoveryBacktest,type Bar,type Trade} from './sol-recovery-breakout.js';

const NOTIONAL=10;
export function summarizeRecovery(trades:readonly Trade[]){
 let equity=100,peak=100,maxDrawdownPct=0;
 const pnls=trades.map(t=>t.netPct*NOTIONAL/100);
 for(const p of pnls){equity+=p;peak=Math.max(peak,equity);maxDrawdownPct=Math.max(maxDrawdownPct,100*(peak-equity)/peak)}
 const n=pnls.length,netPnlUsdt=pnls.reduce((a,b)=>a+b,0),mean=n?netPnlUsdt/n:null;
 const variance=n>1?pnls.reduce((s,p)=>s+(p-(mean??0))**2,0)/(n-1):null;
 const margin=variance===null?null:1.96*Math.sqrt(variance/n);
 return {trades:n,netPnlUsdt,returnOn100Pct:netPnlUsdt,maxDrawdownPct,winRate:n?pnls.filter(p=>p>0).length/n:null,meanNetPnlUsdt:mean,approx95MeanCiUsdt:margin===null||mean===null?null:[mean-margin,mean+margin]};
}
export function evaluateRecovery(bars:readonly Bar[]){
 const segments=splitSolHistory(bars);
 const results=segments.map((segment,i)=>{
  const trades=recoveryBacktest(segment);
  const ranked=i===0?[...trades].sort((x,y)=>y.netPct-x.netPct):[];
  return {split:SOL_SPLIT_LABELS[i],firstAt:segment[0]?.time??null,lastAt:segment.at(-1)?.time??null,bars:segment.length,...summarizeRecovery(trades),
   ...(i===0?{top20:ranked.slice(0,20),bottom20:ranked.slice(-20).reverse()}:{}),
  };
 });
 const holdout=results[3];
 const holdoutDecision=holdout.trades<30?'INSUFFICIENT_DATA':holdout.netPnlUsdt<=0?'REJECT':(holdout.approx95MeanCiUsdt?.[0]??-Infinity)<=0?'INCONCLUSIVE':'CANDIDATE_BEFORE_FUNDING';
 return {mode:'read-only-historical-research',splitDates:SOL_SPLIT_DATES,previouslyInspectedHistoricalData:true,symbol:'SOLUSDT',realOrders:false,notionalUsdt:NOTIONAL,feesIncluded:true,slippageIncluded:true,fundingIncluded:false,execution:'next-minute-open, stop-first, non-overlapping, frozen UTC historical boundaries and untouched prospective period after 2026-11-02',results,holdoutDecision};
}
export async function runRecoveryStudy(pool:pg.Pool){
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  await client.query('SET LOCAL statement_timeout = 120000');
  const r=await client.query('SELECT (EXTRACT(EPOCH FROM start_at)*1000)::bigint::text AS time,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at',['SOLUSDT']);
  const bars:Bar[]=r.rows.map(x=>({time:Number(x.time),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)}));
  return {...evaluateRecovery(bars),opportunityContrast:evaluateSolOpportunities(bars)};
 }finally{try{await client.query('ROLLBACK')}finally{client.release()}}
}
