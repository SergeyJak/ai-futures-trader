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
   try{const result=await backfill();console.info('V6_BACKFILL_RESULT',JSON.stringify(result));return true}
   finally{backfillRunning=false}
  },
 };
}
