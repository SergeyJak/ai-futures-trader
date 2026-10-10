import test from 'node:test';import assert from 'node:assert/strict';import {researchThirtyMinuteRange} from '../src/range30.js';import {readFileSync} from 'node:fs';
test('30-minute range research is deterministic and skips missing candles',()=>{
 const make=(gap=false)=>Array.from({length:150},(_,i)=>{const price=i<32?100:100+i*.01;return {start_at:new Date(Date.parse('2026-10-10T10:00:00Z')+(i+(gap&&i>100?1:0))*60000).toISOString(),open:String(price),close:String(price+.02),high:String(price+.04),low:String(price-.04)}});
 const a=researchThirtyMinuteRange(make());assert.equal(a.configurations.length,12);assert.ok(a.configurations.every(x=>x.trades>=0));assert.deepEqual(researchThirtyMinuteRange(make()),a);
 const b=researchThirtyMinuteRange(make(true));assert.equal(b.configurations.length,12);
});
test('pair research endpoints are read-only and both exist',()=>{
 const api=readFileSync('src/index.ts','utf8');for(const path of ['/api/pairs','/api/range30','researchThirtyMinuteRange','pairedDiagnostics'])assert.ok(api.includes(path));assert.ok(api.includes('chronologicalSplit'));
});
