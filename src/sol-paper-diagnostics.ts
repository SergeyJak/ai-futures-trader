type Trade={id:number;variant:string;entry_at:string|Date;exit_at:string|Date;entry_price:number;exit_price:number;net_pnl:number;reason:string};
type Variant={id:string;position?:{entry:number;entryAt:number;pendingAt?:number}|null;closedTrades:number;realizedNetPnl:number;postFixClosedTrades?:number;postFixRealizedNetPnl?:number;postFixWins?:number;trades:Trade[]};
type Report={variants:Variant[];feeRate:number;slippageRate:number};

/** Read-only SOL paper evidence. Zero observed trades is not an observed zero return. */
export function solPaperDiagnostics(long:Report,short:Report,now=new Date()){
 const summarize=(report:Report,side:'LONG'|'SHORT')=>({
  side,feeRate:report.feeRate,slippageRate:report.slippageRate,
  variants:report.variants.map(v=>{
   const corrected=v.postFixClosedTrades??0,wins=v.postFixWins??0;
   const validClosed=Number.isInteger(v.closedTrades)&&v.closedTrades>=0;
   const validCorrected=validClosed&&Number.isInteger(corrected)&&corrected>=0&&corrected<=v.closedTrades;
   const validWins=validCorrected&&Number.isInteger(wins)&&wins>=0&&wins<=corrected;
   const qualityIssues:string[]=[];
   if(!validClosed)qualityIssues.push('invalid_closed_count');
   if(!validCorrected)qualityIssues.push('invalid_postfix_count');
   if(!validWins)qualityIssues.push('invalid_postfix_wins');
   if(v.closedTrades>0&&!Number.isFinite(v.realizedNetPnl)||corrected>0&&!Number.isFinite(v.postFixRealizedNetPnl))qualityIssues.push('invalid_pnl');
   if(v.closedTrades===0&&Number.isFinite(v.realizedNetPnl)&&v.realizedNetPnl!==0)qualityIssues.push('lifetime_pnl_without_trades');
   if(corrected===0&&Number.isFinite(v.postFixRealizedNetPnl)&&v.postFixRealizedNetPnl!==0)qualityIssues.push('postfix_pnl_without_trades');
   return {
    id:v.id,active:!!v.position&&!('pendingAt' in v.position)&&Number.isFinite(v.position.entryAt),
    closed:v.closedTrades,
    netPnl:validClosed&&v.closedTrades>0&&Number.isFinite(v.realizedNetPnl)?v.realizedNetPnl:null,
    legacyClosed:validCorrected?v.closedTrades-corrected:null,
    postFixClosed:corrected,
    postFixNetPnl:validCorrected&&corrected>0&&Number.isFinite(v.postFixRealizedNetPnl)?v.postFixRealizedNetPnl!:null,
    postFixWins:validWins?wins:null,
    postFixWinRate:validWins&&corrected>0?wins/corrected:null,
    insufficientPostFixSample:!validCorrected||corrected<30,
    qualityIssues,postFixMetricsValid:qualityIssues.length===0,
    lastTrades:v.trades.slice(0,3).map(t=>{
     const entry=Date.parse(String(t.entry_at)),exit=Date.parse(String(t.exit_at));
     const validDates=Number.isFinite(entry)&&Number.isFinite(exit);
     const durationMinutes=validDates?(exit-entry)/60000:null;
     const entryPrice=Number(t.entry_price),exitPrice=Number(t.exit_price),netPnl=Number(t.net_pnl);
     const validClock=validDates&&durationMinutes!==null&&Number.isInteger(durationMinutes)&&durationMinutes>0&&entry%60000===0&&exit%60000===0;
     return {id:t.id,reason:t.reason,entryAt:validDates?new Date(entry).toISOString():null,exitAt:validDates?new Date(exit).toISOString():null,durationMinutes,entryPrice,exitPrice,netPnl,validClock,validEvidence:validClock&&Number.isFinite(entryPrice)&&entryPrice>0&&Number.isFinite(exitPrice)&&exitPrice>0&&Number.isFinite(netPnl)};
    })
   };
  })
 });
 return {at:now.toISOString(),mode:'forward-paper-only',realOrders:false,long:summarize(long,'LONG'),short:summarize(short,'SHORT')};
}
