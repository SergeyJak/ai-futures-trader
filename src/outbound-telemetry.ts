type Bucket={requests:number;errors:number;rateLimited:number;byStatus:Record<string,number>};
const counts=new Map<string,Bucket>();
const LIMIT=240;
export function recordOutbound(host:string,path:string,status:number,source='collector',at=Date.now()){
 const minute=new Date(at).toISOString().slice(0,16);
 const key=[minute,host,path,source].join('|');
 const item=counts.get(key)??{requests:0,errors:0,rateLimited:0,byStatus:{}};
 item.requests++;if(status>=400||status===0)item.errors++;if(status===429)item.rateLimited++;
 item.byStatus[String(status)]=(item.byStatus[String(status)]??0)+1;counts.set(key,item);
 if(counts.size>LIMIT){const first=counts.keys().next().value;if(first)counts.delete(first)}
}
export function outboundSnapshot(){return [...counts.entries()].map(([key,value])=>{const [minute,host,path,source]=key.split('|');return {minute,host,path,source,...value}})}
export function installOutboundTelemetry(){
 const original=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  const tracked=url.hostname==='api.bybit.com'||url.hostname==='api.kopyon.com';
  try{const response=await original(input,init);if(tracked)recordOutbound(url.hostname,url.pathname,response.status);return response}
  catch(error){if(tracked)recordOutbound(url.hostname,url.pathname,0);throw error}
 };
}
