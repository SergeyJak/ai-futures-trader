export type AuditTrade={id:string;account_id:number;symbol:string;side:string;quantity:string;entry_price:string;exit_price:string;entry_at:string;exit_at:string;pnl:string;reason:string};
export type AuditBar={start_at:string;open:string;high:string;low:string;close:string};
const FEE=.0006,SLIP=.0002;
export function auditTrade(t:AuditTrade,bars:AuditBar[]){
 const qty=Number(t.quantity),entry=Number(t.entry_price),exit=Number(t.exit_price),stored=Number(t.pnl);
 const direction=t.side==='LONG'?1:-1;
 const gross=(exit-entry)*qty*direction;
 const entryFee=entry*qty*FEE,exitFee=exit*qty*FEE;
 const calculated=gross-entryFee-exitFee;
 const entryMarket=entry/(1+direction*SLIP),exitMarket=exit/(1-direction*SLIP);
 const marketGross=(exitMarket-entryMarket)*qty*direction;
 const slippageCost=marketGross-gross;
 const entryTime=Date.parse(t.entry_at),exitTime=Date.parse(t.exit_at);
 const byTime=new Map(bars.map(b=>[Date.parse(b.start_at),b]));
 const entryBar=byTime.get(entryTime),exitBar=byTime.get(exitTime);
 const entryReferenceInRange=!!entryBar&&entryMarket>=Number(entryBar.low)-1e-5&&entryMarket<=Number(entryBar.high)+1e-5;
 const exitReferenceInRange=!!exitBar&&exitMarket>=Number(exitBar.low)-1e-5&&exitMarket<=Number(exitBar.high)+1e-5;
 const durationMinutes=(exitTime-entryTime)/60000;
 const timeoutExitAtOpen=t.reason==='TIME'&&!!exitBar&&Math.abs(exitMarket-Number(exitBar.open))<=Math.max(.005,Number(exitBar.open)*.000001);
 return {id:t.id,account:t.account_id,symbol:t.symbol,side:t.side,entryAt:t.entry_at,exitAt:t.exit_at,reason:t.reason,quantity:qty,entry,exit,storedPnl:stored,recomputedPnl:calculated,delta:calculated-stored,gross,entryFee,exitFee,totalFees:entryFee+exitFee,slippageCost,marketGross,entryMarket,exitMarket,durationMinutes,entryBarFound:!!entryBar,exitBarFound:!!exitBar,entryReferenceInRange,exitReferenceInRange,timeoutExitAtOpen,possibleEntryBarStopTakeOmission:true};
}
export function auditSummary(trades:ReturnType<typeof auditTrade>[]){
 const total=(k:keyof ReturnType<typeof auditTrade>)=>trades.reduce((s,t)=>s+Number(t[k]||0),0);
 const winners=trades.filter(x=>x.storedPnl>0),losers=trades.filter(x=>x.storedPnl<0);
 const grossWins=winners.reduce((s,x)=>s+x.storedPnl,0),grossLoss=-losers.reduce((s,x)=>s+x.storedPnl,0);
 return {trades:trades.length,wins:winners.length,winRate:trades.length?winners.length/trades.length:null,profitFactor:grossLoss>0?grossWins/grossLoss:null,gross:total('gross'),fees:total('totalFees'),estimatedSlippage:total('slippageCost'),net:total('storedPnl'),recomputedNet:total('recomputedPnl'),absoluteReconciliationError:trades.reduce((s,t)=>s+Math.abs(t.delta),0),missingEntryCandles:trades.filter(x=>!x.entryBarFound).length,missingExitCandles:trades.filter(x=>!x.exitBarFound).length,entryPriceOutsideCandle:trades.filter(x=>x.entryBarFound&&!x.entryReferenceInRange).length,exitPriceOutsideCandle:trades.filter(x=>x.exitBarFound&&!x.exitReferenceInRange).length,timeoutAtUnexpectedOpen:trades.filter(x=>x.reason==='TIME'&&x.exitBarFound&&!x.timeoutExitAtOpen).length};
}
