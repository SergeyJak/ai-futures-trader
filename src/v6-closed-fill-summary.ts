export type ClosedFill={side:string;opened_time:string;closed_time:string;entry_price:string;exit_price:string;status:string};
export function summarizeClosedFills(rows:ClosedFill[]){
 const valid=rows.flatMap(r=>{
  if(/PARTIAL|OPEN|ACTIVE|PENDING/i.test(r.status))return [];
  const dir=/^(LONG|BUY)$/i.test(r.side)?1:/^(SHORT|SELL)$/i.test(r.side)?-1:0;
  const start=Number(r.opened_time),end=Number(r.closed_time),entry=Number(r.entry_price),exit=Number(r.exit_price);
  if(!dir||!/^\d{13}$/.test(r.opened_time)||!/^\d{13}$/.test(r.closed_time)||end<=start||![entry,exit].every(v=>Number.isFinite(v)&&v>0))return [];
  return [{holdMinutes:(end-start)/60000,gross:dir*(exit/entry-1)}];
 });
 const holds=valid.map(v=>v.holdMinutes).sort((a,b)=>a-b);
 const buckets={under30m:0,from30mTo1h:0,from1hTo4h:0,over4h:0};
 for(const v of valid){if(v.holdMinutes<30)buckets.under30m++;else if(v.holdMinutes<60)buckets.from30mTo1h++;else if(v.holdMinutes<=240)buckets.from1hTo4h++;else buckets.over4h++}
 const costs=[{name:'gross',fee:0,slip:0},{name:'base',fee:0.0006,slip:0.0003},{name:'stress',fee:0.0006,slip:0.0006}];
 return {rowsExamined:rows.length,validClosedFills:valid.length,excluded:rows.length-valid.length,holding:buckets,medianHoldMinutes:holds.length?holds[Math.floor((holds.length-1)/2)]:null,costSensitivity:costs.map(c=>{
  const net=valid.map(v=>v.gross-2*(c.fee+c.slip)),wins=net.filter(v=>v>0),losses=net.filter(v=>v<0),gain=wins.reduce((a,b)=>a+b,0),loss=-losses.reduce((a,b)=>a+b,0);
  return {scenario:c.name,feePerSide:c.fee,slippagePerSide:c.slip,count:net.length,winRate:net.length?wins.length/net.length:null,meanNetReturn:net.length?net.reduce((a,b)=>a+b,0)/net.length:null,profitFactor:loss>0?gain/loss:null};
 }),note:'Observed closed fills only; open snapshots and partial closes excluded. Not a replayable signal or proof of profitability.'};
}
