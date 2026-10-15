/** Track database-using background promises so shutdown can drain them. */
export function createBackgroundJobTracker(){
 const pending=new Set<Promise<unknown>>();
 return {
  track<T>(job:Promise<T>):Promise<T>{
   pending.add(job);
   // Observe completion without creating an unhandled rejected promise.
   void job.then(()=>{pending.delete(job)},()=>{pending.delete(job)});
   return job;
  },
  get pending(){return pending.size},
 };
}
