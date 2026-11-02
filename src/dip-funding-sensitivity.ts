import type pg from 'pg';
import {DIP_RESEARCH_CUTOFF,DIP_RESEARCH_RULES,scoreDipContinuationTrade,type ResearchTrade} from './dip-continuation-research.js';

type FundingRow={funding_at:string|Date;rate:string|number};
type Coverage={complete?:boolean;requestedFrom?:number;requestedTo?:number};
type Observation={id:string;entryAt:number;exitAt:number;netBefore:number;netAfter:number;funding:number;candidate:boolean;volumeRising:boolean;events:number};
const CUTOFF=Date.parse(DIP_RESEARCH_CUTOFF);

function independent(rows:Observation[]){
 const sorted=[...rows].sort((a,b)=>a.exitAt-b.exitAt||a.entryAt-b.entryAt||a.id.localeCompare(b.id));
 const selected:Observation[]=[];let end=-Infinity;
 for(const r of sorted){if(r.entryAt>=end){selected.push(r);end=r.exitAt}}
 return selected.sort((a,b)=>a.entryAt-b.entryAt||a.id.localeCompare(b.id));
}
function metrics(rows:Observation[]){
 let equity=100,peak=100,drawdown=0;
 const pnls=rows.map(r=>r.netAfter),sum=pnls.reduce((a,b)=>a+b,0),n=pnls.length,mean=n?sum/n:null;
 for(const pnl of pnls){equity+=pnl;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,100*(peak-equity)/peak)}
 const variance=n>1?pnls.reduce((a,p)=>a+(p-(mean??0))**2,0)/(n-1):null;
 const margin=variance===null?null:1.96*Math.sqrt(variance/n);
 return {trades:n,netBeforeFundingUsdt:rows.reduce((a,r)=>a+r.netBefore,0),estimatedFundingUsdt:rows.reduce((a,r)=>a+r.funding,0),
  estimatedNetAfterFundingUsdt:sum,returnOn100Pct:sum,maxDrawdownPct:drawdown,
  winRate:n?pnls.filter(p=>p>0).length/n:null,
  approximate95MeanCiUsdt:margin===null||mean===null?null:[mean-margin,mean+margin],
  settlementEvents:rows.reduce((a,r)=>a+r.events,0)};
}
/** Sensitivity estimate, NOT actual exchange funding cash flows or a trading signal. */
export function estimateDipFunding(rows:ResearchTrade[],funding:FundingRow[],coverage:Coverage|null){
 const scores=new Map<string,ReturnType<typeof scoreDipContinuationTrade>>();
 for(const t of rows){const s=scoreDipContinuationTrade(t);if(s&&!scores.has(String(s.entryAt)))scores.set(String(s.entryAt),s)}
 const valid=[...scores.values()].filter((s):s is NonNullable<typeof s>=>s!==null);
 const rates=funding.map(r=>({at:new Date(r.funding_at).getTime(),rate:Number(r.rate)})).sort((a,b)=>a.at-b.at);
 const invalidRates=rates.some((r,i)=>!Number.isFinite(r.at)||!Number.isFinite(r.rate)||Math.abs(r.rate)>1||(i>0&&r.at===rates[i-1].at));
 const full=coverage?.complete===true&&Number.isFinite(coverage.requestedFrom)&&Number.isFinite(coverage.requestedTo)&&!invalidRates;
 const evaluated:Observation[]=[];let uncovered=0,boundaryAmbiguous=0;
 for(const s of valid){
  if(!full||s.entryAt<coverage!.requestedFrom!||s.exitAt>coverage!.requestedTo!){uncovered++;continue}
  if(rates.some(r=>r.at===s.entryAt||r.at===s.exitAt)){boundaryAmbiguous++;continue}
  const t=rows.find(t=>String(new Date(t.entry_at).getTime())===String(s.entryAt)&&scoreDipContinuationTrade(t)!==null)!;
  const side=t.side==='LONG'?1:-1;
  const events=rates.filter(r=>r.at>s.entryAt&&r.at<s.exitAt);
  const fundingPnl=-side*DIP_RESEARCH_RULES.notionalUsdt*events.reduce((sum,r)=>sum+r.rate,0);
  evaluated.push({id:s.id,entryAt:s.entryAt,exitAt:s.exitAt,netBefore:s.netPnl,netAfter:s.netPnl+fundingPnl,
   funding:fundingPnl,candidate:s.candidate,volumeRising:s.volumeRising,events:events.length});
 }
 const status=!full?'incomplete_funding_history':uncovered||boundaryAmbiguous?'incomplete_trade_coverage':'estimated_only';
 const group=(items:Observation[])=>({
  independentBaseline:metrics(independent(items)),
  independentCandidate:metrics(independent(items.filter(r=>r.candidate))),
  independentVolumeOnly:metrics(independent(items.filter(r=>r.volumeRising)))
 });
 return {status,coveredTrades:evaluated.length,eligibleTrades:valid.length,uncoveredTrades:uncovered,boundaryAmbiguousTrades:boundaryAmbiguous,
  fundingRows:rates.length,providerHistoryComplete:coverage?.complete===true,
  development:status==='estimated_only'?group(evaluated.filter(t=>t.entryAt<CUTOFF)):null,
  forwardHoldout:status==='estimated_only'?group(evaluated.filter(t=>t.entryAt>=CUTOFF)):null,
  caveat:'Fixed 10 USDT notional times public settlement rate; actual mark-notional, exchange funding cash flows and fee tier unverified. Never promote on this estimate.'};
}
export async function dipFundingSensitivity(pool:pg.Pool,rows:ResearchTrade[]){
 const coverage=await pool.query("SELECT details->'fundingCoverage'->'SOLUSDT' AS coverage FROM research_collector_status WHERE name='public-research-funding'");
 const funding=await pool.query("SELECT funding_at,rate FROM research_funding_rates WHERE symbol='SOLUSDT' ORDER BY funding_at");
 return estimateDipFunding(rows,funding.rows as FundingRow[],coverage.rows[0]?.coverage as Coverage|null??null);
}
