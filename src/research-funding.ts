import type {FundingSettlement} from './research-data-store.js';
export type FundingFetcher=(url:string|URL,init?:RequestInit)=>Promise<Response>;
export type FundingResult={symbol:string;rows:FundingSettlement[];pages:number;complete:boolean;reason?:string;invalidRecords:number;duplicateRecords:number;requestedFrom:number;requestedTo:number};
export class FundingHttpError extends Error{
 constructor(public readonly status:number,message=`Funding HTTP ${status}`){super(message);this.name='FundingHttpError'}
}
const DAY=86400000;
export async function fetchFundingHistory(symbol:string,now:number,fetcher:FundingFetcher=fetch,signal?:AbortSignal):Promise<FundingResult>{
 if(!/^[A-Z0-9]{2,30}$/.test(symbol)||!Number.isSafeInteger(now)||now<=0)throw new Error('Invalid funding symbol or timestamp');
 signal?.throwIfAborted();
 const start=now-120*DAY;let end=now;const rows:FundingSettlement[]=[];const seen=new Map<number,string>();const pageKeys=new Set<string>();
 const result:FundingResult={symbol,rows,pages:0,complete:false,invalidRecords:0,duplicateRecords:0,requestedFrom:start,requestedTo:now};
 for(let page=0;page<5;page++){
  signal?.throwIfAborted();
  const url=new URL('https://api.bybit.com/v5/market/funding/history');
  url.search=new URLSearchParams({category:'linear',symbol,startTime:String(start),endTime:String(end),limit:'200'}).toString();
  const timeout=AbortSignal.timeout(15000);const requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetcher(url,{signal:requestSignal});result.pages++;
  if(!response.ok)throw new FundingHttpError(response.status);
  const body=await response.json() as {retCode?:number;retMsg?:string;result?:{list?:unknown[]}};
  if(body.retCode!==0){
   if(body.retCode===10006)throw new FundingHttpError(429,`Funding provider ${body.retCode}: ${body.retMsg??'rate limited'}`);
   throw new Error(`Funding provider ${body.retCode??'invalid response'}: ${body.retMsg??'unknown error'}`);
  }
  if(!Array.isArray(body.result?.list))throw new Error('Funding response missing settlement list');
  const list=body.result.list;if(list.length>200)throw new Error('Funding response exceeds requested page bound');
  const key=JSON.stringify(list.map(x=>{const r=x as Record<string,unknown>;return [r?.fundingRateTimestamp,r?.fundingRate]}));
  if(pageKeys.has(key)&&list.length){result.reason='repeated-page';return result}
  pageKeys.add(key);let oldest=Infinity;
  for(const item of list){
   if(item===null||typeof item!=='object'){result.invalidRecords++;continue}
   const row=item as Record<string,unknown>;const at=Number(row.fundingRateTimestamp);const rate=row.fundingRate;
   if(row.symbol!==symbol||!Number.isSafeInteger(at)||at<start||at>end||typeof rate!=='string'||rate.length>64||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(rate)||!Number.isFinite(Number(rate))||Math.abs(Number(rate))>1){result.invalidRecords++;continue}
   oldest=Math.min(oldest,at);
   if(seen.has(at)){result.duplicateRecords++;if(seen.get(at)!==rate)result.invalidRecords++;continue}
   seen.set(at,rate);rows.push({symbol,fundingAt:at,rate,fetchedAt:now});
  }
  if(list.length<200||oldest<=start){result.complete=result.invalidRecords===0&&result.duplicateRecords===0;result.reason=result.invalidRecords?'invalid-records':result.duplicateRecords?'duplicate-records':undefined;return result}
  if(!Number.isFinite(oldest)||oldest-1>=end){result.reason='no-pagination-progress';return result}
  end=oldest-1;
 }
 result.reason='page-limit';return result;
}
