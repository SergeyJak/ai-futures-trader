import test from 'node:test';
import assert from 'node:assert/strict';
import {createV6ResearchJobs} from '../src/v6-research-jobs.js';

test('provider failure does not prevent independent candle backfill',async()=>{
 let backfills=0;
 const jobs=createV6ResearchJobs(async()=>{throw Error('Kopyon HTTP 429')},async()=>{backfills++});
 await assert.rejects(jobs.runDiscovery(),/429/);
 assert.equal(await jobs.runBackfill(),true);
 assert.equal(backfills,1);
});

test('backfill skips overlapping invocations and allows later runs',async()=>{
 let count=0;
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve});
 const jobs=createV6ResearchJobs(async()=>{},async()=>{count++;await gate});
 const first=jobs.runBackfill();
 assert.equal(await jobs.runBackfill(),false);
 assert.equal(count,1);
 release();
 assert.equal(await first,true);
 assert.equal(await jobs.runBackfill(),true);
 assert.equal(count,2);
});

test('a failed backfill releases its single-flight guard',async()=>{
 let calls=0;
 const jobs=createV6ResearchJobs(async()=>{},async()=>{if(++calls===1)throw Error('temporary Bybit failure')});
 await assert.rejects(jobs.runBackfill(),/temporary/);
 assert.equal(await jobs.runBackfill(),true);
 assert.equal(calls,2);
});

test('diagnostics include saved candle count',async()=>{
 const jobs=createV6ResearchJobs(async()=>{},async()=>({saved:21,targets:['SOLUSDT'],errors:[]}));
 const result=await jobs.runBackfillDetailed();
 assert.deepEqual(result,{started:true,result:{saved:21,targets:['SOLUSDT'],errors:[]}});
});
