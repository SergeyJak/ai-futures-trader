/** Isolated analysis of *closed* copytrader positions; never consumes open snapshots. */
export type ClosedPosition={traderId:string;openedAt:string|Date;closedAt:string|Date;side:'LONG'|'SHORT';entryPrice:number;exitPrice:number;notional?:number;fundingRateCost?:number};
export type Style='intraday'|'swing'|'multiday'|'insufficient';
export type CostAssumptions={feePerSide:number;slippagePerSide:number};
export const DEFAULT_COSTS:CostAssumptions={feePerSide:0.0006,slippagePerSide:0.0003};
export function holdingHours(p:ClosedPosition):number|null{
 const a=new Date(p.openedAt).getTime(),b=new Date(p.closedAt).getTime();
 return Number.isFinite(a)&&Number.isFinite(b)&&b>a?(b-a)/3600000:null;
}
function median(xs:number[]):number{const a=[...xs].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length?a.length%2?a[i]:(a[i-1]+a[i])/2:NaN}
export function classifyTrader(positions:ClosedPosition[],minClosed=5):{style:Style;medianHours:number|null;closedCount:number}{
 const durations=positions.map(holdingHours).filter((x):x is number=>x!==null);
 const m=median(durations);
 return {style:durations.length<minClosed?'insufficient':m<4?'intraday':m<48?'swing':'multiday',medianHours:Number.isFinite(m)?m:null,closedCount:durations.length};
}
export function netReturn(p:ClosedPosition,costs:CostAssumptions=DEFAULT_COSTS):number|null{
 const h=holdingHours(p);
 if(h===null||![p.entryPrice,p.exitPrice,costs.feePerSide,costs.slippagePerSide].every(Number.isFinite)||p.entryPrice<=0||p.exitPrice<=0||costs.feePerSide<0||costs.slippagePerSide<0)return null;
 const direction=p.side==='LONG'?1:p.side==='SHORT'?-1:0;
 if(!direction)return null;
 const entry=p.entryPrice*(1+direction*costs.slippagePerSide),exit=p.exitPrice*(1-direction*costs.slippagePerSide);
 const funding=p.fundingRateCost??0;
 if(!Number.isFinite(funding))return null;
 return direction*(exit-entry)/entry-costs.feePerSide*(1+exit/entry)-funding;
}
export function analyzeHoldingStyles(closed:ClosedPosition[],costs:CostAssumptions=DEFAULT_COSTS){
 const groups=new Map<string,ClosedPosition[]>();
 for(const p of closed){if(!p.traderId||holdingHours(p)===null)continue;const xs=groups.get(p.traderId)??[];xs.push(p);groups.set(p.traderId,xs)}
 return [...groups].map(([traderId,positions])=>{
  const cls=classifyTrader(positions);
  const returns=positions.map(p=>netReturn(p,costs)).filter((x):x is number=>x!==null);
  const wins=returns.filter(x=>x>0),losses=returns.filter(x=>x<0);
  const sum=returns.reduce((a,b)=>a+b,0),down=losses.reduce((a,b)=>a-b,0);
  return {traderId,...cls,sample:returns.length,meanNetReturn:returns.length?sum/returns.length:null,winRate:returns.length?wins.length/returns.length:null,profitFactor:down>0?wins.reduce((a,b)=>a+b,0)/down:null,negativeTrades:losses.length,warning:'Descriptive closed-position analysis only; funding is zero unless explicitly supplied; no out-of-sample profitability evidence'};
 }).sort((a,b)=>b.closedCount-a.closedCount);
}
