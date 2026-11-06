import {relativeStrengthReport,FORWARD_START} from './relative-strength-report.js';
export type JobStatus={enabled:boolean;state:'waiting'|'running'|'idle'|'error'|'disabled';lastAttempt:string|null;lastSuccess:string|null;nextRun:string|null;error:string|null};
export type JobRecord={packet:unknown;checkpoint:unknown;status:JobStatus|null};
export type JobLease={read():Promise<JobRecord>;save(row:JobRecord):Promise<void>};
export type JobStore={read():Promise<JobRecord>;withLock(fn:(lease:JobLease,signal:AbortSignal)=>Promise<void>):Promise<boolean>};
export type WorkerResult={packet:unknown;checkpoint:unknown};
const HOUR=3600000,DELAY=5*60000,START=Date.parse(FORWARD_START);
export const targetBoundary=(now:number)=>Math.floor((now-DELAY)/HOUR)*HOUR;
const iso=(time:number)=>new Date(time).toISOString();
const initial=(enabled:boolean):JobStatus=>({enabled,state:enabled?'waiting':'disabled',lastAttempt:null,lastSuccess:null,nextRun:null,error:null});
function publicError(e:unknown){const message=e instanceof Error?e.message:'';return /^(Binance HTTP \d{3}|Binance connection unavailable|Missing funding:|Missing candles:|Exchange rules changed:|Worker timeout|Worker stopped|Python runtime unavailable|Invalid study boundary)/.test(message)?message.slice(0,240):'Расчёт не завершён: данные или инфраструктура недоступны. См. журнал сервиса.'}
export function createRelativeStrengthJob(store:JobStore,options:{worker:(packet:unknown,end:number,signal:AbortSignal)=>Promise<WorkerResult>;now?:()=>number;enabled?:boolean}){
 const now=options.now??Date.now,enabled=options.enabled??true;
 let inFlight:Promise<void>|null=null,timer:ReturnType<typeof setInterval>|undefined,stopped=false,controller:AbortController|null=null,localError:JobStatus|null=null;
 async function execute(){
  if(!enabled||stopped)return;
  const runController=new AbortController();controller=runController;
  try{await store.withLock(async(lease,leaseSignal)=>{
   let row=await lease.read();if(stopped||runController.signal.aborted)return;localError=null;const t=now(),end=targetBoundary(t);let state=row.status??initial(enabled);
   if(state.nextRun&&Date.parse(state.nextRun)>t&&state.state!=='running')return;
   const prior=row.checkpoint?relativeStrengthReport(row.checkpoint,t):null;
   if(end<=START||(prior?.forward.asOf&&Date.parse(prior.forward.asOf)>=end)){
    await lease.save({...row,status:{...state,enabled:true,state:prior?'idle':'waiting',nextRun:iso((Math.floor(t/HOUR)+1)*HOUR+DELAY),error:null}});return;
   }
   const signal=AbortSignal.any([runController.signal,leaseSignal]);
   state={...state,enabled:true,state:'running',lastAttempt:iso(t),nextRun:null,error:null};await lease.save({...row,status:state});
   try{
    signal.throwIfAborted();const result=await options.worker(row.packet,end,signal);signal.throwIfAborted();
    const checked=relativeStrengthReport(result.checkpoint,now());
    if(checked.forward.asOf!==iso(end)&&Date.parse(checked.forward.asOf??'')!==end)throw Error('Invalid worker boundary');
    if(checked.forward.scenarios.length!==2)throw Error('Both cost scenarios required');
    await lease.save({packet:result.packet,checkpoint:result.checkpoint,status:{...state,state:'idle',lastSuccess:iso(now()),nextRun:iso(end+HOUR+DELAY),error:null}});localError=null;
    console.info('RELATIVE_STRENGTH_SUCCESS',JSON.stringify({asOf:checked.forward.asOf,scenarios:checked.forward.scenarios.map(s=>({name:s.name,equity:s.equity}))}));
   }catch(e){
    if(leaseSignal.aborted)throw e;
    state={...state,state:'error',nextRun:iso(now()+10*60000),error:publicError(e)};
    await lease.save({...row,status:state});console.error('RELATIVE_STRENGTH_JOB_ERROR',e instanceof Error?e.message:String(e));
   }
  })}catch(e){localError={...initial(enabled),state:'error',lastAttempt:iso(now()),nextRun:iso(now()+10*60000),error:publicError(e)};console.error('RELATIVE_STRENGTH_STORE_ERROR',e instanceof Error?e.message:String(e))}finally{controller=null}
 }
 async function run(){if(inFlight)return inFlight;if(localError?.nextRun&&Date.parse(localError.nextRun)>now())return;inFlight=execute();try{await inFlight}finally{inFlight=null}}
 async function report(){const row=await store.read(),result=relativeStrengthReport(row.checkpoint,now());const automation=localError??row.status??initial(enabled);return {...result,forward:{...result.forward,scheduled:enabled,automation:{...automation,enabled,...(!enabled?{state:'disabled' as const,nextRun:null}:{})}}}}
 return {run,report,start(){if(timer||!enabled||stopped)return;void run();timer=setInterval(()=>{void run()},60000);timer.unref()},async stop(){stopped=true;if(timer)clearInterval(timer);controller?.abort(Error('Worker stopped'));await inFlight}};
}
