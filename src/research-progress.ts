import type pg from 'pg';
import {evaluateStoredEntryFilters} from './entry-filter-stored.js';
import {summarizeOos} from './entry-filter-decision.js';

type Version='v3'|'v4';
type Study={version:Version;status:'ready'|'error';result?:Awaited<ReturnType<typeof evaluateStoredEntryFilters>>;decisions?:ReturnType<typeof summarizeOos>;error?:string};
export type ResearchProgress={kind:'entry-oos-progress';state:'pending'|'running'|'ready'|'error';lastStartedAt:string|null;lastCompletedAt:string|null;cutoff:string|null;nextRunAt:string|null;studies:Study[];notes:string[]};
const DAY=86400000,INTERVAL=6*3600000;
/** Explicitly observational: only SELECT inside a READ ONLY transaction. */
export function createResearchProgress(pool:pg.Pool,now:()=>number=Date.now){
 let running=false,started:number|null=null,completed:number|null=null,cutoff:string|null=null,studies:Study[]=[],lastError=false;
 const snapshot=():ResearchProgress=>({kind:'entry-oos-progress',state:running?'running':completed===null?'pending':lastError?'error':'ready',lastStartedAt:started===null?null:new Date(started).toISOString(),lastCompletedAt:completed===null?null:new Date(completed).toISOString(),cutoff,nextRunAt:completed===null?null:new Date(completed+INTERVAL).toISOString(),studies,notes:['Research only; no orders or strategy changes','Training: 30 days; untouched holdout: 7 days','Candidate status is not proof of future profitability']});
 async function run(){
  if(running||completed!==null&&now()-completed<INTERVAL)return snapshot();
  running=true;started=now();lastError=false;const today=new Date(now());today.setUTCHours(0,0,0,0);
  // Fixed UTC day boundary, full holdout is guaranteed complete before study begins.
  cutoff=new Date(today.getTime()-8*DAY).toISOString();
  const next:Study[]=[];let client:pg.PoolClient|undefined;
  try{
   client=await pool.connect();
   for(const version of ['v3','v4'] as const){
    try{
     await client.query('BEGIN READ ONLY');
     const result=await evaluateStoredEntryFilters(client,version,cutoff,30);
     next.push({version,status:'ready',result,decisions:summarizeOos(result.scores)});
    }catch(e){lastError=true;next.push({version,status:'error',error:e instanceof Error?e.message:'Study unavailable'})}
    finally{
     // A failed SQL query aborts its transaction. Clear it before the next study.
     try{await client.query('ROLLBACK')}catch{lastError=true}
    }
   }
  }catch(e){lastError=true;for(const version of ['v3','v4'] as const)if(!next.some(s=>s.version===version))next.push({version,status:'error',error:e instanceof Error?e.message:'Database unavailable'})}
  finally{if(client){try{await client.query('ROLLBACK')}catch{}client.release()}completed=now();studies=next;running=false}
  return snapshot();
 }
 return {snapshot,run};
}
