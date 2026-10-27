/** Read-only V8 forward-paper evidence. Never equate an empty sample with zero profit. */
type V8Variant={
 id:string;symbol:string;timeframe:number;closedTrades:number;netPnl:number;wins:number;
 balance:number;last_bar?:string|Date|null;position?:unknown;pending?:unknown;gapAudits?:number;
 postCutoverClosedTrades?:number;postCutoverNetPnl?:number;postCutoverWins?:number;postCutoverMaxDrawdownClosed?:number;
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
   const cutoverCount=v.postCutoverClosedTrades;
   const cutoverCountValid=Number.isSafeInteger(cutoverCount)&&Number(cutoverCount)>=0&&Number(cutoverCount)<=v.closedTrades;
   const cutoverWinsValid=Number.isSafeInteger(v.postCutoverWins)&&Number(v.postCutoverWins)>=0&&Number(v.postCutoverWins)<=Number(cutoverCount);
   const cutoverPnlValid=Number.isFinite(v.postCutoverNetPnl);
   const cutoverDrawdownValid=Number.isFinite(v.postCutoverMaxDrawdownClosed)&&Number(v.postCutoverMaxDrawdownClosed)>=0&&Number(v.postCutoverMaxDrawdownClosed)<=1;
   if(cutoverCount!==undefined&&!cutoverCountValid)qualityIssues.push('invalid_cutover_count');
   if(v.postCutoverWins!==undefined&&!cutoverWinsValid)qualityIssues.push('invalid_cutover_wins');
   if(v.postCutoverNetPnl!==undefined&&!cutoverPnlValid)qualityIssues.push('invalid_cutover_pnl');
   if(v.postCutoverMaxDrawdownClosed!==undefined&&!cutoverDrawdownValid)qualityIssues.push('invalid_cutover_drawdown');
   if(cutoverCountValid&&cutoverCount===0&&cutoverPnlValid&&v.postCutoverNetPnl!==0)qualityIssues.push('cutover_pnl_without_trades');
   const hasCutoverSample=cutoverCountValid&&Number(cutoverCount)>0&&cutoverWinsValid&&cutoverPnlValid&&cutoverDrawdownValid;
   return {
    id:v.id,symbol:v.symbol,timeframeMinutes:v.timeframe,
    closed:closedValid?v.closedTrades:null,
    netPnl:hasValidSample?v.netPnl:null,
    winRate:hasValidSample?v.wins/v.closedTrades:null,
    insufficientSample:!closedValid||v.closedTrades<30,
    gapAudits:gapsValid?gaps:null,
    postCutoverClosed:cutoverCountValid?cutoverCount:null,
    postCutoverNetPnl:hasCutoverSample?v.postCutoverNetPnl:null,
    postCutoverWinRate:hasCutoverSample?Number(v.postCutoverWins)/Number(cutoverCount):null,
    postCutoverMaxDrawdownClosed:hasCutoverSample?v.postCutoverMaxDrawdownClosed:null,
    postCutoverInsufficientSample:!cutoverCountValid||Number(cutoverCount)<30,
    active:v.position!=null,
    pending:v.pending!=null,
    lastBarLagMinutes:lagMinutes,
    stale:lagMinutes===null||lagMinutes>3,
    qualityIssues,metricsValid:qualityIssues.length===0
   };
  })
 };
}
