/** Public OKX SWAP lead-trader discovery. No credentials or account actions. */
export function extractOkxTraderCodes(payload:unknown,limit=3):string[]{
 if(!payload||typeof payload!=='object')return [];
 const obj=payload as {code?:unknown;data?:unknown};
 if(obj.code!=='0'||!Array.isArray(obj.data))return [];
 const seen=new Set<string>();
 for(const group of obj.data){
  if(!group||typeof group!=='object')continue;
  const rows=(group as {ranks?:unknown}).ranks;
  for(const trader of Array.isArray(rows)?rows:[]){
   if(!trader||typeof trader!=='object')continue;
   const code=(trader as {uniqueCode?:unknown}).uniqueCode;
   if(typeof code==='string'&&/^(?:[A-Za-z0-9]{16}|[A-Za-z0-9]{18})$/.test(code))seen.add(code);
   if(seen.size>=limit)return [...seen];
  }
 }
 return [...seen];
}
export async function discoverOkxTraderCodes(fetcher:typeof fetch=fetch):Promise<string[]>{
 const url='https://www.okx.com/api/v5/copytrading/public-lead-traders?instType=SWAP&sortType=overview&limit=10';
 const response=await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('OKX_DISCOVERY_HTTP_'+response.status);
 return extractOkxTraderCodes(await response.json());
}
