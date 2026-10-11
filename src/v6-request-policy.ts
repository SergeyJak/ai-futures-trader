// Respect upstream Retry-After and use a conservative default pause.
export const MIN_PAUSE_MS=2*60*60*1000;
export function pauseForRetryAfter(value:string|null,now=Date.now()):number{
 const seconds=value===null?NaN:Number(value);
 const delay=Number.isFinite(seconds)&&seconds>=0?seconds*1000:value?Date.parse(value)-now:NaN;
 return Number.isFinite(delay)?Math.max(MIN_PAUSE_MS,Math.min(12*60*60*1000,delay)):MIN_PAUSE_MS;
}
export function rotateResearchSample(ids:string[],now=Date.now()):string[]{
 if(!ids.length)return [];
 const hour=Math.floor(now/3600000),start=(hour*2)%ids.length;
 return Array.from({length:Math.min(2,ids.length)},(_,i)=>ids[(start+i)%ids.length]);
}
