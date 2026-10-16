/** Read-only, fixed chronological OOS evaluation of entry-time features.
 * Never modifies live/paper strategy rules or submits orders.
 */
export type EntryObservation={at:string;symbol:string;side:'LONG'|'SHORT';net:number;features:Record<string,number>};
export type EntryFilter={name:string;accept:(features:Record<string,number>)=>boolean};
export type FilterScore={name:string;trainTrades:number;testTrades:number;testNet:number;testMean:number;baselineNet:number;baselineTrades:number;baselineMean:number;netVsBaseline:number;coverage:number;eligible:boolean;trainNet:number;trainMean:number;trainBaselineMean:number;selectedOnTrain:boolean};
export function evaluateEntryFilters(rows:EntryObservation[],filters:EntryFilter[],cutoff:string,minTest=30):FilterScore[]{
 const split=Date.parse(cutoff);
 if(!Number.isFinite(split))throw Error('Invalid fixed OOS cutoff');
 if(!Number.isInteger(minTest)||minTest<1)throw Error('Invalid minimum test size');
 const clean=rows.filter(r=>Number.isFinite(Date.parse(r.at))&&Number.isFinite(r.net)&&Object.values(r.features).every(Number.isFinite));
 const train=clean.filter(r=>Date.parse(r.at)<split),test=clean.filter(r=>Date.parse(r.at)>=split);
 const trainBaselineMean=train.length?train.reduce((sum,r)=>sum+r.net,0)/train.length:0;
 const baselineNet=test.reduce((sum,r)=>sum+r.net,0);
 const baselineMean=test.length?baselineNet/test.length:0;
 return filters.map(f=>{
  const training=train.filter(r=>f.accept(r.features));
  const heldout=test.filter(r=>f.accept(r.features));
  const trainNet=training.reduce((sum,r)=>sum+r.net,0);
  const trainMean=training.length?trainNet/training.length:0;
  // Selection uses only training outcomes; never select by test PnL.
  const selectedOnTrain=f.name!=='baseline'&&training.length>=minTest&&trainMean>0&&trainMean>trainBaselineMean;
  const testNet=heldout.reduce((sum,r)=>sum+r.net,0);
  return {name:f.name,trainTrades:training.length,trainNet,trainMean,trainBaselineMean,selectedOnTrain,testTrades:heldout.length,testNet,testMean:heldout.length?testNet/heldout.length:0,baselineNet,baselineTrades:test.length,baselineMean,netVsBaseline:testNet-(baselineMean*heldout.length),coverage:test.length?heldout.length/test.length:0,eligible:heldout.length>=minTest};
 });
}
/** Features are known only from candles strictly preceding the entry candle. */
export function priorCandleFeatures(prior:{open:number;high:number;low:number;close:number}[]){
 if(prior.length<30)throw Error('At least 30 preceding candles required');
 if(prior.some(b=>![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.open<=0||b.high<b.low))throw Error('Invalid candles');
 const recent=prior.slice(-30),last=recent.at(-1)!;
 const returns=recent.map(b=>(b.close-b.open)/b.open);
 const volatility=Math.sqrt(returns.reduce((s,r)=>s+r*r,0)/returns.length);
 const trend5=last.close/recent.at(-6)!.close-1;
 const range30=(Math.max(...recent.map(b=>b.high))-Math.min(...recent.map(b=>b.low)))/last.close;
 return {volatility,trend5,range30};
}
export const ENTRY_FILTER_CANDIDATES:EntryFilter[]=[
 {name:'baseline',accept:()=>true},
 {name:'low-volatility',accept:f=>f.volatility<0.0015},
 {name:'high-volatility',accept:f=>f.volatility>=0.0015},
 {name:'downtrend',accept:f=>f.trend5<0},
 {name:'uptrend',accept:f=>f.trend5>=0}
];
