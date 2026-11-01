import type {ResearchDataStore} from './research-data-store.js';
import type {ResearchDataConfig} from './research-data-runtime.js';
type Reader=Pick<ResearchDataStore,'report'|'samples'|'funding'|'tradeHistory'>;
export type ResearchResponse={status:number;body:unknown};
class InvalidRange extends Error{}
function time(value:string|null,fallback:number){
 if(value===null)return fallback;
 if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw new InvalidRange('Use an ISO timestamp with an explicit timezone');
 const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new InvalidRange('Invalid timestamp');return parsed;
}
export async function researchDataResponse(method:string,rawUrl:string,store:Reader,config:ResearchDataConfig,runtime:unknown,now=Date.now()):Promise<ResearchResponse>{
 if(method!=='GET')return {status:405,body:{error:'Read-only endpoint; GET required'}};
 try{
  const url=new URL(rawUrl,'http://localhost');
  if(url.pathname==='/api/research-data'){
   return {status:200,body:{at:new Date(now).toISOString(),mode:'public-research-data-only',realOrders:false,...await store.report(config.symbols),runtime,
    feeAssumptions:{takerRate:config.takerFeeRate,makerRate:config.makerFeeRate,verified:false,source:'configured assumptions; not account or VIP verification'},
    retention:{samplesAndTradesDays:config.retentionDays,fundingDays:730},bucketSeconds:10,rowLimit:1500}};
  }
  const resource=url.pathname.slice('/api/research-data/'.length);
  if(!['samples','trades','funding'].includes(resource))return {status:404,body:{error:'Unknown research data resource'}};
  const symbol=url.searchParams.get('symbol')??'';
  if(!config.symbols.includes(symbol))throw new InvalidRange('Unsupported research symbol');
  const to=time(url.searchParams.get('to'),now),from=time(url.searchParams.get('from'),to-(resource==='funding'?30*86400000:3600000));
  const maximum=resource==='funding'?31*86400000:86400000;
  if(to<from||to-from>maximum||to>now+60000)throw new InvalidRange('Invalid or oversized history range');
  const rows=resource==='samples'?await store.samples(symbol,from,to):resource==='trades'?await store.tradeHistory(symbol,from,to):await store.funding(symbol,from,to);
  return {status:200,body:{symbol,resource,from:new Date(from).toISOString(),to:new Date(to).toISOString(),rowLimit:1500,possiblyTruncated:rows.length===1500,rows,
   note:'Missing rows are not zero observations. Short-data responses are capped; request smaller time windows if possiblyTruncated.'}};
 }catch(e){
  if(e instanceof InvalidRange)return {status:400,body:{error:e.message}};
  return {status:503,body:{error:'Research data unavailable',runtime}};
 }
}
