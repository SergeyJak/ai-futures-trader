/** Independently schedule research jobs without coupling candle backfill to provider availability. */
export function createV6ResearchJobs(
 discovery:()=>Promise<unknown>,
 backfill:()=>Promise<unknown>,
){
 let backfillRunning=false;
 async function runBackfillDetailed(){
  if(backfillRunning)return {started:false as const};
  backfillRunning=true;
  try{return {started:true as const,result:await backfill()}}
  finally{backfillRunning=false}
 }
 return {
  runDiscovery:()=>discovery(),
  runBackfillDetailed,
  async runBackfill():Promise<boolean>{
   if(backfillRunning)return false;
   backfillRunning=true;
   try{await backfill();return true}
   finally{backfillRunning=false}
  },
 };
}
