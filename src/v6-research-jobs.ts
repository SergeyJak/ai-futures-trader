/** Independently schedule research jobs without coupling candle backfill to provider availability. */
export function createV6ResearchJobs<T>(
 discovery:()=>Promise<unknown>,
 backfill:()=>Promise<T>,
){
 let backfillRunning=false;
 return {
  runDiscovery:()=>discovery(),
  async runBackfill():Promise<{started:false}|{started:true;result:T}>{
   if(backfillRunning)return {started:false};
   backfillRunning=true;
   try{return {started:true,result:await backfill()}}
   finally{backfillRunning=false}
  },
 };
}
