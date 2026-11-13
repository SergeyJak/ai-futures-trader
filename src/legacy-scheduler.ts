/** Archived experiments never run unless explicitly opted in. No data is deleted. */
export function legacyJobsEnabled(env:NodeJS.ProcessEnv){return env.LEGACY_BACKGROUND_JOBS_ENABLED==='true'}
export function createLegacyScheduler(enabled:boolean){
 let stopped=false;const intervals=new Set<ReturnType<typeof setInterval>>(),timeouts=new Set<ReturnType<typeof setTimeout>>();
 return {
  every(callback:()=>void,ms:number){if(!enabled||stopped)return;const timer=setInterval(()=>{if(!stopped)callback()},ms);intervals.add(timer);return timer},
  after(callback:()=>void,ms:number){if(!enabled||stopped)return;const timer=setTimeout(()=>{timeouts.delete(timer);if(!stopped)callback()},ms);timeouts.add(timer);return timer},
  stop(){stopped=true;for(const timer of intervals)clearInterval(timer);for(const timer of timeouts)clearTimeout(timer);intervals.clear();timeouts.clear()}
 };
}
