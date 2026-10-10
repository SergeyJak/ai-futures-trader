import type {Candle} from './candles.js';
export const MINUTE=60000;
export function missingRanges(minutes:number[],fromMs:number,toMs:number,maxBatch=200):Array<{start:number;end:number}>{
 const present=new Set(minutes);const result:Array<{start:number;end:number}>=[];
 let start=-1;
 for(let t=fromMs;t<=toMs;t+=MINUTE){
  if(!present.has(t)){if(start<0)start=t;}
  else if(start>=0){for(let a=start;a<t;a+=maxBatch*MINUTE)result.push({start:a,end:Math.min(t-MINUTE,a+(maxBatch-1)*MINUTE)});start=-1;}
 }
 if(start>=0)for(let a=start;a<=toMs;a+=maxBatch*MINUTE)result.push({start:a,end:Math.min(toMs,a+(maxBatch-1)*MINUTE)});
 return result;
}
export function parseBybitHistory(data:unknown,symbol:string,fromMs:number,toMs:number):Candle[]{
 if(!data||typeof data!=='object')throw new Error('Invalid Bybit response');
 const payload=data as Record<string,unknown>;
 if(payload.retCode!==0)throw new Error('Bybit history error: '+String(payload.retMsg));
 const result=payload.result as Record<string,unknown>|undefined;
 if(!result||result.symbol!==symbol||!Array.isArray(result.list))throw new Error('Invalid Bybit history list');
 return result.list.map((row:unknown)=>{
  if(!Array.isArray(row)||row.length<7)throw new Error('Invalid history candle');
  const [start,open,high,low,close,volume,turnover]=row;
  const ms=Number(start);
  if(!Number.isSafeInteger(ms)||ms%MINUTE!==0||ms<fromMs||ms>toMs)throw new Error('Unexpected candle timestamp');
  for(const value of [open,high,low,close,volume,turnover])
   if(typeof value!=='string'||!/^\\d+(?:\\.\\d+)?$/.test(value))throw new Error('Invalid history decimal');
  return {symbol,startMs:ms,open,high,low,close,volume,turnover,confirmed:true} as Candle;
 });
}
export async function fetchHistory(symbol:string,fromMs:number,toMs:number):Promise<Candle[]>{
 const url=new URL('https://api.bybit.com/v5/market/kline');
 url.searchParams.set('category','linear');url.searchParams.set('symbol',symbol);
 url.searchParams.set('interval','1');url.searchParams.set('start',String(fromMs));
 url.searchParams.set('end',String(toMs+MINUTE-1));url.searchParams.set('limit','200');
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Bybit REST HTTP '+response.status);
 return parseBybitHistory(await response.json(),symbol,fromMs,toMs);
}
