import type pg from 'pg';
import {FEE, SLIP} from './strategy-paper.js';

// Frozen before the holdout begins. Selection of this candidate is exploratory.
export const MOMENTUM_BRACKET_CUTOFF='2026-11-01T00:00:00.000Z';
export const MOMENTUM_BRACKET_NOTIONAL=10;
const MIN_PAIRS=30;
const MAX_ROWS=1000;

export type MomentumTrade={
 id:string|number;variant:string;side:string;
 entry_at:string|Date;exit_at:string|Date;
 entry_price:number|string;exit_price:number|string;
};
type Trade={id:string;variant:'bracket'|'24h';side:'LONG'|'SHORT';entryAt:number;exitAt:number;net:number};
type Pair={entryAt:number;exitAt:number;candidate:Trade;control:Trade};

function score(t:MomentumTrade):Trade|null{
 if(t.variant!=='bracket'&&t.variant!=='24h')return null;
 if(t.side!=='LONG'&&t.side!=='SHORT')return null;
 const entryAt=new Date(t.entry_at).getTime(),exitAt=new Date(t.exit_at).getTime();
 const entry=Number(t.entry_price),exit=Number(t.exit_price);
 if(!Number.isFinite(entryAt)||!Number.isFinite(exitAt)||exitAt<=entryAt||
    !Number.isFinite(entry)||!Number.isFinite(exit)||entry<=0||exit<=0)return null;
 const dir=t.side==='LONG'?1:-1;
 // Stored next-open-v2 entry/exit prices already include slippage; apply fees once.
 const net=MOMENTUM_BRACKET_NOTIONAL*(dir*(exit-entry)/entry-FEE*(1+exit/entry));
 if(!Number.isFinite(net))return null;
 return {id:String(t.id),variant:t.variant,side:t.side,entryAt,exitAt,net};
}
function stats(values:number[]){
 const n=values.length,netPnlUsdt=values.reduce((s,v)=>s+v,0),mean=n?netPnlUsdt/n:null;
 let equity=100,peak=100,maxDd=0,wins=0;
 for(const value of values){equity+=value;peak=Math.max(peak,equity);maxDd=Math.max(maxDd,(peak-equity)/peak);if(value>0)wins++}
 const variance=n>1?values.reduce((s,v)=>s+(v-(mean??0))**2,0)/(n-1):null;
 const margin=variance===null?null:1.96*Math.sqrt(variance/n);
 return {trades:n,netPnlUsdt,returnOn100Pct:netPnlUsdt,maxDrawdownClosedPct:maxDd*100,
  winRate:n?wins/n:null,meanNetPnlUsdt:mean,
  approximate95MeanCiUsdt:margin===null||mean===null?null:[mean-margin,mean+margin]};
}
function independent(pairs:Pair[]){
 // A pair occupies the market until BOTH alternatives have exited.
 const ordered=[...pairs].sort((a,b)=>a.exitAt-b.exitAt||a.entryAt-b.entryAt);
 const selected:Pair[]=[];let lastExit=-Infinity;
 for(const pair of ordered){if(pair.entryAt>=lastExit){selected.push(pair);lastExit=pair.exitAt}}
 return selected.sort((a,b)=>a.entryAt-b.entryAt);
}
export function evaluateMomentumBracket(rows:MomentumTrade[],totalRows=rows.length){
 const seen=new Map<string,Trade>(),ambiguous=new Set<string>();
 let invalid=0,duplicates=0;
 for(const row of rows){
  const trade=score(row);
  if(!trade){invalid++;continue}
  const key=trade.variant+'|'+trade.side+'|'+trade.entryAt;
  if(seen.has(key)){duplicates++;ambiguous.add(key)}
  else seen.set(key,trade);
 }
 for(const key of ambiguous)seen.delete(key);
 const pairs:Pair[]=[];let unmatchedCandidate=0,unmatchedControl=0;
 for(const [key,trade] of seen){
  if(trade.variant!=='bracket')continue;
  const control=seen.get('24h|'+trade.side+'|'+trade.entryAt);
  if(!control){unmatchedCandidate++;continue}
  pairs.push({entryAt:trade.entryAt,exitAt:Math.max(trade.exitAt,control.exitAt),candidate:trade,control});
 }
 for(const [key,trade] of seen){
  if(trade.variant==='24h'&&!seen.has('bracket|'+trade.side+'|'+trade.entryAt))unmatchedControl++;
 }
 const cutoff=Date.parse(MOMENTUM_BRACKET_CUTOFF);
 function group(groupPairs:Pair[]){
  const selected=independent(groupPairs);
  const candidate=stats(selected.map(p=>p.candidate.net));
  const control=stats(selected.map(p=>p.control.net));
  const pairedDifference=stats(selected.map(p=>p.candidate.net-p.control.net));
  return {matchedPairs:groupPairs.length,independentPairs:selected.length,candidate,control,
   meanPairedDifferenceUsdt:pairedDifference.meanNetPnlUsdt,
   approximate95PairedDifferenceCiUsdt:pairedDifference.approximate95MeanCiUsdt};
 }
 const development=group(pairs.filter(p=>p.entryAt<cutoff));
 const forwardHoldout=group(pairs.filter(p=>p.entryAt>=cutoff));
 const candidate=forwardHoldout.candidate;
 const difference=forwardHoldout.meanPairedDifferenceUsdt;
 const status=forwardHoldout.independentPairs<MIN_PAIRS?'insufficient_forward_sample'
  :candidate.netPnlUsdt<=0||(difference??-Infinity)<=0?'reject_no_positive_paired_edge'
  :(candidate.approximate95MeanCiUsdt?.[0]??-Infinity)<=0||
   (forwardHoldout.approximate95PairedDifferenceCiUsdt?.[0]??-Infinity)<=0
   ?'inconclusive_mean_uncertainty':'positive_before_funding_unverified';
 return {
  mode:'read-only-paper-research',realOrders:false,strategy:'momentum_continuation',
  candidateVariant:'bracket',controlVariant:'24h',cutoff:MOMENTUM_BRACKET_CUTOFF,
  notionalUsdt:MOMENTUM_BRACKET_NOTIONAL,feePerSide:FEE,slippagePerSide:SLIP,
  pricing:'Corrected next-open-v2 execution prices include slippage; fees applied once on fixed 10 USDT notional',
  funding:'unverified; excluded',
  confidence:'Candidate selected after exploratory comparison of multiple variants; no edge claim without untouched prospective paired evidence. Normal 95% intervals assume independent regimes.',
  quality:{totalPostFixRows:totalRows,loaded:rows.length,invalid,duplicates,unmatchedCandidate,unmatchedControl,truncated:totalRows>MAX_ROWS},
  development,forwardHoldout,status,
  decisionRule:'At least 30 non-overlapping matched forward entries, positive bracket net, bracket mean above 24h mean, lower approximate 95% CIs for bracket and paired difference both > 0; funding still unverified',
  warning:'Read-only. No live orders, strategy changes or parameter tuning. The paired subset can differ from all trades because position occupancy differs.'
 };
}
export async function momentumBracketResearch(pool:pg.Pool){
 const where="strategy='momentum_continuation' AND variant IN ('bracket','24h') AND execution_model='next-open-v2'";
 const [rows,count]=await Promise.all([
  pool.query('SELECT id,variant,side,entry_at,exit_at,entry_price,exit_price FROM v6_paper_trades WHERE '+where+' ORDER BY entry_at DESC,id DESC LIMIT 1000'),
  pool.query('SELECT COUNT(*)::int AS n FROM v6_paper_trades WHERE '+where)
 ]);
 return {at:new Date().toISOString(),...evaluateMomentumBracket(rows.rows as MomentumTrade[],Number(count.rows[0]?.n??0))};
}
