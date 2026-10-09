export interface Candle { symbol:string; startMs:number; open:string; high:string; low:string; close:string; volume:string; turnover:string; confirmed:boolean }
const decimal=(v:unknown):string=>{if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v))throw new Error('Invalid decimal');return v};
export function parseCandle(message:unknown,allowed:ReadonlySet<string>):Candle[]{
 if(typeof message!=='object'||message===null)return [];
 const m=message as Record<string,unknown>;
 if(typeof m.topic!=='string'||!m.topic.startsWith('kline.1.')||!Array.isArray(m.data))return [];
 const symbol=m.topic.substring(8); if(!allowed.has(symbol))return [];
 return m.data.map((item:unknown)=>{if(!item||typeof item!=='object')throw new Error('Invalid candle');
 const x=item as Record<string,unknown>;
 if(typeof x.start!=='number'||!Number.isSafeInteger(x.start)||x.start<=0||x.start%60000!==0)throw new Error('Invalid time');
 if(typeof x.confirm!=='boolean')throw new Error('Invalid confirmation');
 return {symbol,startMs:x.start,open:decimal(x.open),high:decimal(x.high),low:decimal(x.low),close:decimal(x.close),volume:decimal(x.volume),turnover:decimal(x.turnover),confirmed:x.confirm};});
}