import type pg from 'pg';
export async function pairedDiagnostics(pool:pg.Pool){
 const versions=[] as unknown[];
 for(const [name,table] of [['v1','paper_trades'],['v2','shadow_trades']] as const){
  // Table names are fixed internal constants, never interpolated from requests.
  const rows=await pool.query(`SELECT account_id,symbol,side,quantity::float8 AS qty,entry_price::float8 AS entry,exit_price::float8 AS exit,entry_at::text,exit_at::text,pnl::float8,reason
   FROM ${table} WHERE account_id IN (6,11) ORDER BY entry_at,id`);
  const accounts=[6,11].map(id=>{
   const trades=rows.rows.filter(r=>r.account_id===id);
   const sum=(fn:(r:any)=>number)=>trades.reduce((a,r)=>a+fn(r),0);
   const gross=sum(r=>(r.exit-r.entry)*r.qty*(r.side==='LONG'?1:-1));
   const fees=sum(r=>(r.entry+r.exit)*r.qty*.0006);
   const wins=trades.filter(r=>r.pnl>0).length;
   return {id,trades:trades.length,wins,grossAfterSlippage:gross,fees,net:sum(r=>r.pnl),averageNet:trades.length?sum(r=>r.pnl)/trades.length:null,
    reasons:trades.reduce((a:Record<string,number>,r)=>{a[r.reason]=(a[r.reason]||0)+1;return a},{})};
  });
  const a=rows.rows.filter(r=>r.account_id===6),b=rows.rows.filter(r=>r.account_id===11);
  const used=new Set<number>(),pairs=[];
  for(const x of a){
   const idx=b.findIndex((y,i)=>!used.has(i)&&x.symbol===y.symbol&&x.entry_at===y.entry_at&&x.side!==y.side);
   if(idx<0)continue;used.add(idx);
   const y=b[idx];
   pairs.push({symbol:x.symbol,entryAt:x.entry_at,exit6:x.exit_at,exit11:y.exit_at,net6:x.pnl,net11:y.pnl,combined:x.pnl+y.pnl,sameExit:x.exit_at===y.exit_at});
  }
  versions.push({version:name,accounts,matchedPairs:pairs.length,matchingExit:pairs.filter(x=>x.sameExit).length,matchedCombinedNet:pairs.reduce((s,x)=>s+x.combined,0),lastPairs:pairs.slice(-15)});
 }
 return {at:new Date().toISOString(),feePerSide:.0006,method:'Match same symbol, entry timestamp and opposite side. Gross is after slippage, before commissions.',versions};
}
