type Item={trader_id:string;kind:string;raw:Record<string,unknown>};
const numeric=(x:unknown)=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const ms=(x:unknown)=>{const n=numeric(x);if(n!==null)return n>1e12?n:n>1e9?n*1000:null;const d=Date.parse(String(x));return Number.isFinite(d)?d:null};
export function v6Insights(items:Item[]){
 const closed=items.filter(x=>x.kind==='history');
 const byTrader=new Map<string,Item[]>();
 for(const item of closed)byTrader.set(item.trader_id,[...(byTrader.get(item.trader_id)??[]),item]);
 const results=[...byTrader].map(([id,positions])=>{
 const pnls=positions.map(p=>numeric(p.raw.closing_pnl)).filter((n):n is number=>n!==null);
 const times=positions.map(p=>{const a=ms(p.raw.opened_time),b=ms(p.raw.closed_time);return a!==null&&b!==null&&b>=a?(b-a)/60000:null}).filter((n):n is number=>n!==null).sort((a,b)=>a-b);
 const wins=pnls.filter(n=>n>0),losses=pnls.filter(n=>n<0);
 return {trader:id,records:positions.length,withPnl:pnls.length,winRate:pnls.length?wins.length/pnls.length:null,reportedPnl:pnls.reduce((a,b)=>a+b,0),profitFactor:losses.length?wins.reduce((a,b)=>a+b,0)/Math.abs(losses.reduce((a,b)=>a+b,0)):null,medianHoldMinutes:times.length?times[Math.floor(times.length/2)]:null,shortUnder15:times.filter(n=>n<15).length,under60:times.filter(n=>n<60).length,over240:times.filter(n=>n>=240).length};
 }).sort((a,b)=>b.records-a.records);
 return {historyRecords:closed.length,openSnapshots:items.filter(x=>x.kind==='open').length,traders:results,readyToTrade:false,caveat:'Public partial sample, costs and out-of-sample results not yet validated'};
}
