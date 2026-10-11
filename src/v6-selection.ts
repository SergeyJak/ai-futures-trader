export function selectV6TraderBatch(ids:readonly string[],last:Record<string,number>,limit=5):string[]{return [...new Set(ids)].sort((a,b)=>(last[a]??-Infinity)-(last[b]??-Infinity)).slice(0,limit)}
