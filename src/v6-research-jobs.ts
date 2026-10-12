/** Independently schedule research jobs without coupling candle backfill to provider availability. */
export function createV6ResearchJobs(
 discovery:()=>Promise<unknown>,
 backfill:()=>Promise<unknown>,
){
 let backfillRunning=false;
 return {
  runDiscovery:()=>discovery(),
  async runBackfill():Promise<boolean>{
   if(backfillRunning)return false;
   backfillRunning=true;
   try{await backfill();return true}
   finally{backfillRunning=false}
  },
 };
}
