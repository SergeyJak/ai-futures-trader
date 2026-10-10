import test from 'node:test';import assert from 'node:assert/strict';import {researchExitV4,V4_EXITS} from '../src/v4-exits.js';
import {readFileSync} from 'node:fs';
test('v4 compares the same number of entry events across exit methods',()=>{
 const origin=Date.parse('2026-10-01T00:00:00Z');
 const rows=Array.from({length:1400},(_,i)=>{
  const v=100+Math.sin(i/11)*0.5;
  return {start_at:new Date(origin+i*60000).toISOString(),open:String(v),close:String(v),high:String(v+.11),low:String(v-.11)};
 });
 const r=researchExitV4(rows);
 assert.equal(V4_EXITS.length,6);
 assert.equal(r.results.length,24);
 for(const dip of [.2,.4])for(const side of ['LONG','SHORT']){
  const subset=r.results.filter(x=>x.dipPct===dip&&x.side===side);
  assert.equal(subset.length,6);assert.equal(new Set(subset.map(x=>x.trades)).size,1);
 }
 assert.deepEqual(researchExitV4(rows),r);
});
test('v4 stays read-only and preserves v3 simulation',()=>{
 const index=readFileSync('src/index.ts','utf8');assert.ok(index.includes("req.url==='/api/v4-exits'"));assert.ok(index.includes("req.url==='/api/v3'"));assert.ok(index.includes('runIndependentV3'));
});
