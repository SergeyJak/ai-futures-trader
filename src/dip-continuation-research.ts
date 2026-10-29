import type pg from 'pg';
import {FEE,SLIP} from './strategy-paper.js';

/** Frozen before the forward holdout starts. Do not optimize thresholds on holdout trades. */
export const DIP_RESEARCH_CUTOFF='2026-10-30T00:00:00.000Z';
export const DIP_RESEARCH_RULES={lookbackMinutes:60,trendMin:0.003,volumeRatioMin:1.2,realizedVolMax:0.012,notionalUsdt:10} as const;
const LIMIT=500,MIN_FORWARD_TRADES=30,MINUTE=60000;
export type ResearchCandle={time:string|Date;close:number;volume:number};
export type ResearchTrade={
 id:string|number;side:string;entry_at:string|Date;exit_at:string|Date;
 entry_price:number|string;exit_price:number|string;net_pnl:number|string;
 candles:ResearchCandle[];
};
export type ScoredTrade={id:string;entryAt:number;netPnl:number;trendAligned:boolean;volumeRising:boolean;moderateVolatility:boolean;candidate:boolean};
export function scoreDipContinuationTrade(t:ResearchTrade):ScoredTrade|null{
 const entryAt=new Date(t.entry_at).getTime(),exitAt=new Date(t.exit_at).getTime();
 const entry=Number(t.entry_price),exit=Number(t.exit_price),storedPnl=Number(t.net_pnl);
 const dir=t.side==='LONG'?1:t.side==='SHORT'?-1:0;
 if(!dir||!Number.isFinite(entryAt)||!Number.isFinite(exitAt)||exitAt<=entryAt||
    ![entry,exit,storedPnl].every(Number.isFinite)||entry<=0||exit<=0)return null;
 const bars=t.candles;
 if(!Array.isArray(bars)||bars.length!==DIP_RESEARCH_RULES.lookbackMinutes)return null;
 let vol=0;
 for(let i=0;i<bars.length;i++){
  const b=bars[i],at=new Date(b.time).getTime(),close=Number(b.close),volume=Number(b.volume);
  if(at!==entryAt-(bars.length-i)*MINUTE||!Number.isFinite(close)||close<=0||
     !Number.isFinite(volume)||volume<0)return null;
  if(i>0){const ret=Math.log(close/Number(bars[i-1].close));vol+=ret*ret}
 }
 const first=Number(bars[0].close),last=Number(bars.at(-1)!.close);
 const trendAligned=dir*(last/first-1)>=DIP_RESEARCH_RULES.trendMin;
 const earlier=bars.slice(0,45).reduce((sum,b)=>sum+Number(b.volume),0)/45;
 const recent=bars.slice(45).reduce((sum,b)=>sum+Number(b.volume),0)/15;
 const volumeRising=earlier>0&&recent/earlier>=DIP_RESEARCH_RULES.volumeRatioMin;
 const moderateVolatility=Math.sqrt(vol)<=DIP_RESEARCH_RULES.realizedVolMax;
 // Entry/exit prices already include slippage. Reapply fees, not slippage.
 // Fixed 10 USDT notional per trade makes filtered and baseline results comparable.
 const netPnl=DIP_RESEARCH_RULES.notionalUsdt*(dir*(exit-entry)/entry-FEE*(1+exit/entry));
 if(!Number.isFinite(netPnl))return null;
 return {id:String(t.id),entryAt,netPnl,trendAligned,volumeRising,moderateVolatility,
  candidate:trendAligned&&volumeRising&&moderateVolatility};
}
function metrics(rows:ScoredTrade[]){
 let equity=100,peak=100,maxDrawdown=0,wins=0;
 const pnls=rows.map(t=>t.netPnl);
 for(const p of pnls){equity+=p;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);if(p>0)wins++}
 const sum=equity-100,n=rows.length,mean=n?sum/n:null;
 const variance=n>1?pnls.reduce((a,p)=>a+(p-(mean??0))**2,0)/(n-1):null;
 const margin=variance===null?null:1.96*Math.sqrt(variance/n);
 return {trades:n,netPnlUsdt:sum,returnOn100Pct:sum,maxDrawdownClosedPct:maxDrawdown*100,
  winRate:n?wins/n:null,meanNetPnlUsdt:mean,
  approximate95MeanCiUsdt:margin===null||mean===null?null:[mean-margin,mean+margin]};
}
export function evaluateDipContinuation(rows:ResearchTrade[],totalRows=rows.length){
 const seen=new Set<number>(),scored:ScoredTrade[]=[];
 let missingHistory=0,duplicates=0;
 for(const row of rows){
  const trade=scoreDipContinuationTrade(row);
  if(!trade){missingHistory++;continue}
  if(seen.has(trade.entryAt)){duplicates++;continue}
  seen.add(trade.entryAt);scored.push(trade);
 }
 scored.sort((a,b)=>a.entryAt-b.entryAt||a.id.localeCompare(b.id));
 const cutoff=Date.parse(DIP_RESEARCH_CUTOFF);
 const group=(items:ScoredTrade[])=>({
  baseline:metrics(items),
  candidate:metrics(items.filter(t=>t.candidate)),
  rejected:metrics(items.filter(t=>!t.candidate)),
  trendAligned:metrics(items.filter(t=>t.trendAligned)),
  volumeRising:metrics(items.filter(t=>t.volumeRising)),
  moderateVolatility:metrics(items.filter(t=>t.moderateVolatility))
 });
 const development=group(scored.filter(t=>t.entryAt<cutoff));
 const holdout=group(scored.filter(t=>t.entryAt>=cutoff));
 const status=holdout.baseline.trades<MIN_FORWARD_TRADES||holdout.candidate.trades<MIN_FORWARD_TRADES
  ?'insufficient_forward_sample'
  :holdout.candidate.netPnlUsdt<=0?'reject_candidate'
  :'positive_before_funding_unverified';
 return {
  mode:'read-only-paper-research',realOrders:false,strategy:'dip_continuation',variant:'12h',
  cutoff:DIP_RESEARCH_CUTOFF,rules:DIP_RESEARCH_RULES,feePerSide:FEE,slippagePerSide:SLIP,
  pricing:'next-open-v2 fills already include slippage; fixed 10 USDT notional; both sides charged fees',
  funding:'not verified; excluded from all PnL',
  confidence:'95% normal approximation of mean per-trade PnL assumes IID; overlapping regimes and small samples invalidate proof',
  quality:{totalPostFixTrades:totalRows,loaded:rows.length,covered:scored.length,missingHistory,duplicates,truncated:totalRows>LIMIT},
  development,forwardHoldout:holdout,status,
  warning:'Thresholds frozen before 2026-10-30 UTC; pre-cutoff results are exploratory, not forward validation. No live orders or strategy changes.'
 };
}
export async function dipContinuationResearch(pool:pg.Pool){
 const where="strategy='dip_continuation' AND variant='12h' AND execution_model='next-open-v2'";
 const sql=[
  'SELECT t.id,t.side,t.entry_at,t.exit_at,t.entry_price,t.exit_price,t.net_pnl,',
  "COALESCE((SELECT json_agg(json_build_object('time',c.start_at,'close',c.close::float8,'volume',c.volume::float8) ORDER BY c.start_at)",
  "FROM market_candles c WHERE c.symbol='SOLUSDT' AND c.confirmed=true",
  "AND c.start_at>=t.entry_at-interval '60 minutes' AND c.start_at<t.entry_at),'[]'::json) AS candles",
  'FROM (SELECT id,side,entry_at,exit_at,entry_price,exit_price,net_pnl FROM v6_paper_trades',
  'WHERE '+where+' ORDER BY entry_at DESC,id DESC LIMIT 500) t ORDER BY t.entry_at,t.id'
 ].join(' ');
 const [trades,count]=await Promise.all([
  pool.query(sql),pool.query('SELECT COUNT(*)::int AS n FROM v6_paper_trades WHERE '+where)
 ]);
 return {at:new Date().toISOString(),...evaluateDipContinuation(trades.rows as ResearchTrade[],Number(count.rows[0]?.n??0))};
}
