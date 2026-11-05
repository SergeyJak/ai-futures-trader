import {readFile,stat} from 'node:fs/promises';
import {relativeStrengthHistory} from './relative-strength-history.js';
export const FORWARD_START='2026-11-06T01:00:00Z';
const symbols=new Set(['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LINKUSDT']);
const object=(x:unknown):Record<string,any>=>{if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('Invalid report object');return x as Record<string,any>};
const number=(x:unknown)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new Error('Invalid report number');return x};
const date=(x:unknown)=>{if(typeof x!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(x)||!Number.isFinite(Date.parse(x)))throw new Error('Invalid report timestamp');return Date.parse(x)};
const array=(x:unknown)=>{if(!Array.isArray(x)||x.length>20000)throw new Error('Invalid report array');return x};
function positions(value:unknown){return Object.entries(object(value)).map(([symbol,quantity])=>{if(!symbols.has(symbol))throw new Error('Unknown symbol');return {symbol,quantity:number(quantity)}})}
function scenario(value:unknown,start:number,asOf:number){
 const s=object(value),fee=number(s.fee),slip=number(s.slip);
 const name=fee===.0006&&slip===.0003?'baseline':fee===.0008&&slip===.0007?'stress':null;if(!name)throw new Error('Unknown cost scenario');
 const curve=array(s.curve).map(v=>{const p=object(v);return {at:number(p.at),equity:number(p.equity),positions:positions(p.positions)}});
 if(!curve.length||curve[0].at!==start||curve.at(-1)!.at!==asOf||curve.some((p,i)=>p.at>asOf||(i>0&&p.at<=curve[i-1].at)))throw new Error('Invalid curve coverage');
 const equity=number(s.final);if(Math.abs(equity-curve.at(-1)!.equity)>1e-7)throw new Error('Equity does not match curve');
 const dd=number(s.dd_hourly_pct);if(dd<0)throw new Error('Invalid drawdown');
 const events=array(s.events).map(v=>{const e=object(v);if(!['open','close','funding'].includes(e.kind)||!symbols.has(e.symbol))throw new Error('Invalid event');const at=number(e.at);if(at<start||at>asOf)throw new Error('Event outside report');return e.kind==='funding'?{at,kind:e.kind as string,symbol:e.symbol as string,quantity:null,price:null,cost:null,amount:number(e.amount)}:{at,kind:e.kind as string,symbol:e.symbol as string,quantity:number(e.quantity),price:number(e.price),cost:number(e.cost),amount:null}});
 return {name,equity,cash:number(s.cash),net:equity-100,drawdown:dd,funding:number(s.funding),costs:number(s.costs),closedLegs:events.filter(e=>e.kind==='close').length,positions:curve.at(-1)!.positions,curve:curve.map(({at,equity})=>({at,equity})),events};
}
export function relativeStrengthReport(raw:unknown|null,now=Date.now()){
 const start=Date.parse(FORWARD_START);let asOf:string|null=null;let scenarios:ReturnType<typeof scenario>[]=[];
 if(raw!==null){const r=object(raw);if(date(r.start)!==start||r.orders!==false||r.scheduled!==false)throw new Error('Unexpected checkpoint identity');const end=date(r.as_of);if(end>now||end%3600000)throw new Error('Invalid checkpoint boundary');asOf=r.as_of;
  if(r.status==='provisional-paper'){if(end<=start)throw new Error('No forward interval');scenarios=array(r.scenarios).map(s=>scenario(s,start,end));if(!scenarios.length||new Set(scenarios.map(s=>s.name)).size!==scenarios.length)throw new Error('Missing or duplicate scenario')}
  else if(r.status!=='waiting-for-forward-data'||end>start)throw new Error('Unknown checkpoint state');
 }
 const status=scenarios.length?(now-Date.parse(asOf!)>36*3600000?'stale':'ready'):now<start?'not-started':'awaiting-report';
 return {at:new Date(now).toISOString(),forward:{status,start:FORWARD_START,asOf,scheduled:false,realOrders:false,scenarios},history:relativeStrengthHistory};
}
export async function loadRelativeStrengthReport(path=process.env.RELATIVE_STRENGTH_CHECKPOINT_FILE,now=Date.now()){
 if(!path)return relativeStrengthReport(null,now);
 const info=await stat(path);if(!info.isFile()||info.size>5*1024*1024)throw new Error('Checkpoint exceeds size limit');
 return relativeStrengthReport(JSON.parse(await readFile(path,'utf8')),now);
}
