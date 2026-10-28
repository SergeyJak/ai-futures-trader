import type pg from 'pg';

const BASE='https://www.okx.com';
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
type Position={subPosId?:string;uniqueCode?:string;instId?:string;openTime?:string;closeTime?:string;openAvgPx?:string;closeAvgPx?:string;posSide?:string;[key:string]:unknown};
export async function initOkxHistory(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_okx_history(unique_code TEXT NOT NULL,sub_pos_id TEXT NOT NULL,raw JSONB NOT NULL,open_at TIMESTAMPTZ NOT NULL,close_at TIMESTAMPTZ NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(unique_code,sub_pos_id))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_okx_source_status(unique_code TEXT PRIMARY KEY,last_attempt TIMESTAMPTZ,last_success TIMESTAMPTZ,status TEXT NOT NULL,error TEXT)`);
}
/** Bounded, identifier-free rejection categories for research data-quality telemetry. */
export function okxInvalidClosedReason(p:Position):string|null{
 if(!p.subPosId)return 'missing_position_id';
 const opened=Number(p.openTime),closed=Number(p.closeTime),entry=Number(p.openAvgPx),exit=Number(p.closeAvgPx);
 if(!Number.isFinite(opened)||opened<=0)return 'invalid_open_time';
 if(!Number.isFinite(closed)||closed<opened||closed>Date.now()+60000)return 'invalid_close_time';
 // A positive Infinity previously passed the price check and could enter raw history.
 if(!Number.isFinite(entry)||entry<=0)return 'invalid_entry_price';
 if(!Number.isFinite(exit)||exit<=0)return 'invalid_exit_price';
 if(!['long','short','net'].includes(String(p.posSide)))return 'invalid_side';
 return null;
}
export function validateOkxClosed(p:Position){return okxInvalidClosedReason(p)===null;}
async function requestHistory(code:string,after?:string){
 const u=new URL('/api/v5/copytrading/public-subpositions-history',BASE);
 u.searchParams.set('instType','SWAP');u.searchParams.set('uniqueCode',code);u.searchParams.set('limit','100');if(after)u.searchParams.set('after',after);
 const response=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(response.status===429){const retry=Number(response.headers.get('retry-after'));throw new Error('OKX_429 retry_after_seconds='+ (Number.isFinite(retry)&&retry>0?retry:60));}
 if(!response.ok)throw new Error('OKX_HTTP_'+response.status);
 const data=await response.json() as {code?:string;msg?:string;data?:Position[]};
 if(data.code!=='0'||!Array.isArray(data.data))throw new Error('OKX_API_'+String(data.code)+' '+String(data.msg??'').slice(0,100));
 return data.data;
}
/** Explicitly configured trader codes only. Never infer OKX IDs from another exchange. */
export async function collectOkxHistory(pool:pg.Pool,codes:string[],maxPages=3){
 let inserted=0,invalid=0;const invalidReasons:Record<string,number>={};const errors:string[]=[];
 for(const code of codes.slice(0,10)){
  if(!/^(?:[A-Za-z0-9]{16}|[A-Za-z0-9]{18})$/.test(code)){errors.push('invalid uniqueCode');continue;}
  let cursor:string|undefined;const seen=new Set<string>();
  try{
   await pool.query(`INSERT INTO v6_okx_source_status(unique_code,status,last_attempt) VALUES($1,'fetching',now()) ON CONFLICT(unique_code) DO UPDATE SET status='fetching',last_attempt=now()`,[code]);
   for(let page=0;page<Math.min(maxPages,5);page++){
    if(page||inserted)await wait(500);
    const rows=await requestHistory(code,cursor);
    if(!rows.length)break;
    for(const row of rows){
     const reason=okxInvalidClosedReason(row);
     if(reason){invalid++;invalidReasons[reason]=(invalidReasons[reason]??0)+1;continue;}
     const r=await pool.query(`INSERT INTO v6_okx_history(unique_code,sub_pos_id,raw,open_at,close_at) VALUES($1,$2,$3,to_timestamp($4/1000.0),to_timestamp($5/1000.0)) ON CONFLICT DO NOTHING`,[code,String(row.subPosId),JSON.stringify(row),Number(row.openTime),Number(row.closeTime)]);
     inserted+=r.rowCount??0;
    }
    const last=rows.at(-1)?.subPosId;
    if(!last||seen.has(last))break;
    seen.add(last);cursor=last;
    if(rows.length<100)break;
   }
   await pool.query(`UPDATE v6_okx_source_status SET status='connected',last_success=now(),error=NULL WHERE unique_code=$1`,[code]);
  }catch(e){
   const error=String(e instanceof Error?e.message:e).slice(0,180);errors.push(error);
   await pool.query(`UPDATE v6_okx_source_status SET status='unavailable',error=$2 WHERE unique_code=$1`,[code,error]);
   if(error.startsWith('OKX_429'))break;
  }
 }
 return {insertedClosed:inserted,invalid,invalidReasons,errors};
}
