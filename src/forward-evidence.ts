/** Evidence for independently generated paper trades, never copied-trader history. */
export type PaperClosed={net_pnl:number|string;entry_at:string|Date;exit_at:string|Date};
export function forwardEvidence(trades:PaperClosed[],initialBalance=100){
 let equity=initialBalance,peak=initialBalance,maxDrawdown=0,wins=0,grossWins=0,grossLosses=0;
 const holds:number[]=[];let valid=0;
 for(const t of trades){
  const pnl=Number(t.net_pnl),entry=new Date(t.entry_at).getTime(),exit=new Date(t.exit_at).getTime();
  if(!Number.isFinite(pnl)||!Number.isFinite(entry)||!Number.isFinite(exit)||exit<=entry)continue;
  valid++;equity+=pnl;peak=Math.max(peak,equity);
  if(peak>0)maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
  if(pnl>0){wins++;grossWins+=pnl}else if(pnl<0)grossLosses-=pnl;
  holds.push((exit-entry)/60000);
 }
 holds.sort((a,b)=>a-b);
 return {closed:valid,activeNotIncluded:true,realizedNetPnl:equity-initialBalance,endingRealizedBalance:equity,winRate:valid?wins/valid:null,profitFactor:grossLosses>0?grossWins/grossLosses:null,realizedMaxDrawdown:maxDrawdown,medianHoldMinutes:holds.length?holds[Math.floor((holds.length-1)/2)]:null,fundingIncluded:false,markToMarketIncluded:false,independentExecutionVerified:false,minimumEvidenceMet:valid>=30,warning:'Only last available closed paper trades; drawdown excludes open positions and funding. No profitability claim.'};
}
