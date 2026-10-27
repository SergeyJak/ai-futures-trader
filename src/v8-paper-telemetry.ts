/** Read-only V8 forward-paper evidence. Never equate an empty sample with zero profit. */
type V8Variant={
 id:string;symbol:string;timeframe:number;closedTrades:number;netPnl:number;wins:number;
 balance:number;last_bar?:string|Date|null;position?:unknown;pending?:unknown;gapAudits?:number;
};
export function summarizeV8PaperTelemetry(report:{variants:V8Variant[]},now=new Date()){
 return {
  at:now.toISOString(),mode:'forward-paper-only',realOrders:false,
  funding:'excluded; unknown',execution:'OHLC approximation, not exchange fills',
  variants:report.variants.map(v=>{
   const closedValid=Number.isSafeInteger(v.closedTrades)&&v.closedTrades>=0;
   const winsValid=Number.isSafeInteger(v.wins)&&v.wins>=0&&closedValid&&v.wins<=v.closedTrades;
   const netValid=Number.isFinite(v.netPnl);
   const gaps=Number(v.gapAudits??0);
   const gapsValid=Number.isSafeInteger(gaps)&&gaps>=0;
   const balanceValid=Number.isFinite(v.balance)&&v.balance>=0;
   const barMs=v.last_bar==null?NaN:new Date(v.last_bar).getTime();
   const futureBar=Number.isFinite(barMs)&&barMs>now.getTime();
   const lagMinutes=Number.isFinite(barMs)&&!futureBar?Math.floor((now.getTime()-barMs)/60000):null;
   const qualityIssues:string[]=[];
   if(!closedValid)qualityIssues.push('invalid_closed_count');
   if(!winsValid)qualityIssues.push('invalid_wins');
   if(!netValid)qualityIssues.push('invalid_pnl');
   if(!balanceValid)qualityIssues.push('invalid_balance');
   if(!gapsValid)qualityIssues.push('invalid_gap_count');
   if(v.last_bar!=null&&!Number.isFinite(barMs))qualityIssues.push('invalid_bar_time');
   if(futureBar)qualityIssues.push('future_bar');
   if(closedValid&&v.closedTrades===0&&netValid&&v.netPnl!==0)qualityIssues.push('pnl_without_trades');
   const hasValidSample=closedValid&&v.closedTrades>0&&winsValid&&netValid&&balanceValid;
   return {
    id:v.id,symbol:v.symbol,timeframeMinutes:v.timeframe,
    closed:closedValid?v.closedTrades:null,
    netPnl:hasValidSample?v.netPnl:null,
    winRate:hasValidSample?v.wins/v.closedTrades:null,
    insufficientSample:!closedValid||v.closedTrades<30,
    gapAudits:gapsValid?gaps:null,
    active:v.position!=null,
    pending:v.pending!=null,
    lastBarLagMinutes:lagMinutes,
    stale:lagMinutes===null||lagMinutes>3,
    qualityIssues,metricsValid:qualityIssues.length===0
   };
  })
 };
}
