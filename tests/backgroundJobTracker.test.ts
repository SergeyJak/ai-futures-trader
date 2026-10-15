import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBackgroundJobTracker} from '../src/background-job-tracker.js';

test('tracks overlapping background jobs until settled',async()=>{
 const tracker=createBackgroundJobTracker();
 let a!:()=>void,b!:()=>void;
 const first=new Promise<void>(resolve=>{a=resolve});
 const second=new Promise<void>(resolve=>{b=resolve});
 tracker.track(first);tracker.track(second);
 assert.equal(tracker.pending,2);
 a();await first;assert.equal(tracker.pending,1);
 b();await second;assert.equal(tracker.pending,0);
});
test('removes rejected background jobs',async()=>{
 const tracker=createBackgroundJobTracker();
 const job=tracker.track(Promise.reject(new Error('failed')));
 await assert.rejects(job,/failed/);
 assert.equal(tracker.pending,0);
});
test('shutdown drains tracked jobs before closing database',()=>{
 const src=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const stop=src.slice(src.indexOf('async function stop()'));
 assert.match(stop,/backgroundJobs\.pending>0/);
 assert.ok(stop.indexOf('backgroundJobs.pending>0')<stop.indexOf('await db.close()'));
 assert.match(src,/backgroundJobs\.track\(v6CostResearch\.run\(\)/);
 assert.match(src,/backgroundJobs\.track\(runV6\(db\.v6Pool\(\)\)/);
 assert.match(src,/backgroundJobs\.track\(runV6Backfill\(\)\)/);
});
