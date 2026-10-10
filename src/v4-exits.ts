type Candle={start_at:string;open:string;high:string;low:string;close:string};
type Bar={at:number;open:number;high:number;low:number;close:number};
type Exit='SL_TP'|'TIME_15'|'TIME_30'|'TIME_60'|'TIME_120'|'TRAILING';
const fee=.0006,slip=.0002;
export const V4_EXITS:Exit[]=['SL_TP','TIME_15','TIME_30','TIME_60','TIME_120','TRAILING'];
type Pair={side:'LONG'|'SHORT';entry:number;entryAt:number;entryIndex:number;stop:number;take:number;quantity:number};
function simulate(bars:Bar[],pair:Pair,method:Exit){
 const dir=pair.side==='LONG'?1:-1;
 let stop=pair.stop,mfe=0,mae=0,exit=NaN,exitAt=0,reason='END';
 const limit=method==='SL_TP'?240:method==='TIME_15'?15:method==='TIME_30'?30:method==='TIME_60'?60:method==='TIME_120'?120:240;
 for(let k=pair.entryIndex+1;k<bars.length&&k<=pair.entryIndex+240;k++){
  const b=bars[k],prev=bars[k-1];
  if(b.at-prev.at!==60000)return null;
  // The exact ordering of minute-bar extremes is unknown: stop always wins ties.
  mfe=Math.max(mfe,(dir===1?b.high/pair.entry-1:1-b.low/pair.entry)*100);
  mae=Math.max(mae,(dir===1?1-b.low/pair.entry:b.high/pair.entry-1)*100);
  const elapsed=k-pair.entryIndex;
  if(elapsed>=limit){exit=b.open;exitAt=b.at;reason=limit===240?'HARD_CAP':'TIME';break}
  const stopped=dir===1?b.low<=stop:b.high>=stop;
  const target=dir===1?b.high>=pair.take:b.low<=pair.take;
  if(stopped){exit=dir===1?Math.min(b.open,stop):Math.max(b.open,stop);exitAt=b.at;reason='STOP';break}
  if(method!=='TRAILING'&&target){exit=dir===1?Math.max(b.open,pair.take):Math.min(b.open,pair.take);exitAt=b.at;reason='TAKE';break}
  if(method==='TRAILING'){
   // Update after testing exits; do not use current candle high to justify same-candle stop.
   const proposed=dir===1?b.high*(1-.003):b.low*(1+.003);
   stop=dir===1?Math.max(stop,proposed):Math.min(stop,proposed);
  }
 }
 if(!Number.isFinite(exit))return null;
 const fill=exit*(1-dir*slip),gross=(fill-pair.entry)*dir/pair.entry,fees=fee*(1+fill/pair.entry);
 return {netPct:100*(gross-fees),grossPct:100*gross,feePct:100*fees,mfePct:mfe,maePct:mae,reason,exitAt};
}
export function researchExitV4(rows:Candle[]){
 const b:Bar[]=rows.map(x=>({at:Date.parse(x.start_at),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 const items:Record<string,{side:string;method:Exit;dipPct:number;trades:number;wins:number;net:number;gross:number;fees:number;mfe:number;mae:number;reasons:Record<string,number>}>= {};
 for(const dip of [.002,.004])
 for(const side of ['LONG','SHORT'] as const)
 for(const method of V4_EXITS){const key=[dip,side,method].join('|');items[key]={side,method,dipPct:100*dip,trades:0,wins:0,net:0,gross:0,fees:0,mfe:0,mae:0,reasons:{}}}
 // One common, fixed entry stream for ALL exit methods. No per-method signal optimizations.
 // Entries are spaced >= 240 minutes to avoid overlapping windows or exit-dependent selection.
 for(let i=30;i+241<b.length;i++){
  const prev=b.slice(i-30,i),current=b[i];
  if(prev.some((x,j)=>j>0&&x.at-prev[j-1].at!==60000)||current.at-prev[29].at!==60000)continue;
  const peak=Math.max(...prev.map(x=>x.high));
  let triggered=false;
  for(const dip of [.002,.004]){
   const trigger=peak*(1-dip);
   if(prev[29].close<=trigger||current.open<trigger||current.low>trigger)continue;
   triggered=true;
   for(const side of ['LONG','SHORT'] as const){
    const dir=side==='LONG'?1:-1;
    const entry=trigger*(1+dir*slip),p:Pair={side,entry,entryAt:current.at,entryIndex:i,stop:entry*(1-dir*.004),take:entry*(1+dir*.008),quantity:1};
    // Entry-minute adverse extreme: count stop immediately, never claim same-bar take.
    const instant=dir===1?current.low<=p.stop:current.high>=p.stop;
    for(const method of V4_EXITS){
     const key=[dip,side,method].join('|'),acc=items[key];
     const out=instant?{netPct:100*((p.stop*(1-dir*slip)-entry)*dir/entry-fee*(1+p.stop*(1-dir*slip)/entry)),grossPct:100*(p.stop*(1-dir*slip)-entry)*dir/entry,feePct:100*fee*(1+p.stop*(1-dir*slip)/entry),mfePct:0,maePct:0,reason:'ENTRY_STOP_BOUND',exitAt:current.at}:simulate(b,p,method);
     if(!out)continue;
     acc.trades++;if(out.netPct>0)acc.wins++;acc.net+=out.netPct;acc.gross+=out.grossPct;acc.fees+=out.feePct;acc.mfe+=out.mfePct;acc.mae+=out.maePct;acc.reasons[out.reason]=(acc.reasons[out.reason]??0)+1;
    }
   }
  }
  if(triggered)i+=240;
 }
 return {type:'research-only',method:'identical dip-threshold entries; conservative minute OHLC; 0.06% taker fees and 0.02% adverse slippage per side; maximum 240m safety cap',results:Object.values(items).map(a=>({side:a.side,method:a.method,dipPct:a.dipPct,trades:a.trades,wins:a.wins,winRate:a.trades?a.wins/a.trades:null,averageNetPct:a.trades?a.net/a.trades:null,averageGrossPct:a.trades?a.gross/a.trades:null,averageFeesPct:a.trades?a.fees/a.trades:null,averageMfePct:a.trades?a.mfe/a.trades:null,averageMaePct:a.trades?a.mae/a.trades:null,reasons:a.reasons}))};
}
