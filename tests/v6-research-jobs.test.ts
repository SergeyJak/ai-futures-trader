import test from 'node:test';
import assert from 'node:assert/strict';
import {createV6ResearchJobs} from '../src/v6-research-jobs.js';

test('provider failure does not prevent independent candle backfill',async()=>{
 let backfills=0;
 const jobs=createV6ResearchJobs(async()=>{throw Error('Kopyon HTTP 429')},async()=>{backfills++});
 await assert.rejects(jobs.runDiscovery(),/429/);
 assert.deepEqual(await jobs.runBackfill(),{started:true,result:undefined});
 assert.equal(backfills,1);
});

test('backfill skips overlapping invocations and allows later runs',async()=>{
 let count=0;
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve});
 const jobs=createV6ResearchJobs(async()=>{},async()=>{count++;await gate});
 const first=jobs.runBackfill();
 assert.deepEqual(await jobs.runBackfill(),{started:false});
 assert.equal(count,1);
 release();
 assert.deepEqual(await first,{started:true,result:undefined});
 assert.deepEqual(await jobs.runBackfill(),{started:true,result:undefined});
 assert.equal(count,2);
});

test('a failed backfill releases its single-flight guard',async()=>{
 let calls=0;
 const jobs=createV6ResearchJobs(async()=>{},async()=>{if(++calls===1)throw Error('temporary Bybit failure')});
 await assert.rejects(jobs.runBackfill(),/temporary/);
 assert.deepEqual(await jobs.runBackfill(),{started:true,result:undefined});
 assert.equal(calls,2);
});

test('backfill returns partial failures and saved-candle evidence to the caller',async()=>{
 const outcome={targets:['SOLUSDT'],saved:0,errors:['SOLUSDT: no historical candles'],skippedCooldown:1,mode:'research-only' as const};
 const jobs=createV6ResearchJobs(async()=>{},async()=>outcome);
 assert.deepEqual(await jobs.runBackfill(),{started:true,result:outcome});
});
