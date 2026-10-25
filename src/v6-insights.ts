type Item={trader_id:string;kind:string;raw:Record<string,unknown>};
const numeric=(x:unknown)=>{if(typeof x==='number')return Number.isFinite(x)?x:null;if(typeof x!=='string'||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(x.trim()))return null;const n=Number(x.trim());return Number.isFinite(n)?n:null};
const ms=(x:unknown)=>{const n=numeric(x);if(n!==null)return n>1e12?n:n>1e9?n*1000:null;const d=Date.parse(String(x));return Number.isFinite(d)?d:null};
export function isFullyClosedHistory(raw:Record<string,unknown>):boolean{
 const status=String(raw.status??'').toUpperCase();
 if(/PARTIAL|OPEN|ACTIVE|PENDING/.test(status))return false;
 const opened=ms(raw.opened_time),closed=ms(raw.closed_time);
 const side=String(raw.side??'').trim().toUpperCase(),symbol=String(raw.symbol??'').trim();
 return opened!==null&&closed!==null&&closed>opened&&symbol.length>0&&/^(LONG|SHORT|BUY|SELL)$/.test(side);
}
/** Values are sorted by callers; for even samples use both central observations. */
const medianSorted=(values:number[])=>values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null;
function positionKey(x:Item){
 const r=x.raw;
 // Provider snapshots may express the same position with ISO/epoch clocks and BUY/LONG aliases.
 // Canonicalize only validated closed-position fields to avoid double-counting history.
 const side=String(r.side??'').trim().toUpperCase();
 const direction=side==='BUY'?'LONG':side==='SELL'?'SHORT':side;
 return [x.trader_id,String(r.symbol??'').trim().toUpperCase(),direction,ms(r.opened_time),ms(r.closed_time)].join('|');
}
export function v6Insights(items:Item[]){
 const history=items.filter(x=>x.kind==='history');
 const complete=history.filter(x=>isFullyClosedHistory(x.raw));
 const partial=history.filter(x=>/PARTIAL/i.test(String(x.raw.status??'')));
 const byKey=new Map<string,Item>();
 const ambiguousLatestPnl=new Set<string>();
 const ambiguousLatestCosts=new Set<string>();
 const costEvidence=(raw:Record<string,unknown>)=>[raw.closed_volume,raw.avg_entry_price,raw.avg_close_price].map(numeric);
 for(const item of complete){
  const key=positionKey(item),prev=byKey.get(key);
  if(!prev){byKey.set(key,item);continue}
  const updated=ms(item.raw.update_time)??0,previousUpdated=ms(prev.raw.update_time)??0;
  if(updated>previousUpdated){
   byKey.set(key,item);
   ambiguousLatestPnl.delete(key);
   ambiguousLatestCosts.delete(key);
  }else if(updated===previousUpdated){
   // Equal-time snapshots must agree independently on PnL and fee inputs.
   // A conflict in either cannot be resolved by the order of provider rows.
   if(numeric(item.raw.closing_pnl)!==numeric(prev.raw.closing_pnl))ambiguousLatestPnl.add(key);
   const costs=costEvidence(item.raw),previousCosts=costEvidence(prev.raw);
   if(costs.some((value,i)=>value!==previousCosts[i]))ambiguousLatestCosts.add(key);
  }
 }
 const closed=[...byKey.entries()].map(([key,item])=>({
  ...item,
  raw:{...item.raw,
   ...(ambiguousLatestPnl.has(key)?{closing_pnl:null}:{}),
   ...(ambiguousLatestCosts.has(key)?{closed_volume:null}:{}),
  },
 }));
 const byTrader=new Map<string,Item[]>();
 for(const item of closed)byTrader.set(item.trader_id,[...(byTrader.get(item.trader_id)??[]),item]);
 const results=[...byTrader].map(([id,positions])=>{
 const pnls=positions.map(p=>numeric(p.raw.closing_pnl)).filter((n):n is number=>n!==null);
 const times=positions.map(p=>{const a=ms(p.raw.opened_time),b=ms(p.raw.closed_time);return a!==null&&b!==null&&b>=a?(b-a)/60000:null}).filter((n):n is number=>n!==null).sort((a,b)=>a-b);
 const wins=pnls.filter(n=>n>0),losses=pnls.filter(n=>n<0);
 const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
 const avgWin=wins.length?sum(wins)/wins.length:null,avgLoss=losses.length?Math.abs(sum(losses)/losses.length):null;
 const sides={long:positions.filter(x=>/LONG|BUY/i.test(String(x.raw.side))).length,short:positions.filter(x=>/SHORT|SELL/i.test(String(x.raw.side))).length};
 const symbols=[...new Set(positions.map(x=>String(x.raw.symbol??'')))];
 const leverage=positions.map(x=>numeric(x.raw.leverage)).filter((x):x is number=>x!==null).sort((a,b)=>a-b);
 // Hypothetical taker commission (0.06% per side), NOT actual exchange fees.
 const feeEstimates=positions.map(p=>{const q=numeric(p.raw.closed_volume),entry=numeric(p.raw.avg_entry_price),exit=numeric(p.raw.avg_close_price);return q!==null&&q>0&&entry!==null&&entry>0&&exit!==null&&exit>0?q*(entry+exit)*0.0006:null});
 const feeCovered=feeEstimates.filter((x):x is number=>x!==null);
 return {trader:id,sides,symbols,medianLeverage:medianSorted(leverage),records:positions.length,withPnl:pnls.length,winRate:pnls.length?wins.length/pnls.length:null,reportedPnl:sum(pnls),profitFactor:losses.length?sum(wins)/Math.abs(sum(losses)):null,averageWin:avgWin,averageLoss:avgLoss,observedRewardRisk:avgWin!==null&&avgLoss!==null?avgWin/avgLoss:null,breakEvenWinRate:avgWin!==null&&avgLoss!==null?avgLoss/(avgWin+avgLoss):null,estimatedRoundTripFees:sum(feeCovered),costCoverage:feeCovered.length,estimatedNetBeforeSlippage:feeCovered.length===positions.length&&pnls.length===positions.length?sum(pnls)-sum(feeCovered):null,medianHoldMinutes:medianSorted(times),shortUnder15:times.filter(n=>n<15).length,under60:times.filter(n=>n<60).length,over240:times.filter(n=>n>=240).length};
 }).sort((a,b)=>b.records-a.records);
 return {historyRecords:closed.length,rawHistoryRecords:history.length,partialHistoryRecords:partial.length,unclassifiedHistoryRecords:history.length-complete.length-partial.length,duplicateHistoryRecords:complete.length-closed.length,ambiguousLatestPnlPositions:ambiguousLatestPnl.size,ambiguousLatestCostPositions:ambiguousLatestCosts.size,openSnapshots:items.filter(x=>x.kind==='open').length,traders:results,readyToTrade:false,caveat:'Only chronologically valid, directional positions with a symbol and non-partial status count as closed. Gross PnL is provider-reported; fee estimates assume 0.06% taker each side, omit slippage and funding, and are not copy-trading returns. Conflicting equal-time snapshots have no trusted PnL or fee inputs. No out-of-sample validation.'};
}
