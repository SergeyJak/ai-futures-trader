import test from 'node:test';import assert from 'node:assert/strict';import {researchThirtyMinuteBounce} from '../src/bounce30.js';import {readFileSync} from 'node:fs';
test('bounce research compares long and short with the same stop take horizons',()=>{
 const bars=Array.from({length:160},(_,i)=>{const p=i<35?100:99.6+Math.sin(i/8)*.18;return {start_at:new Date(Date.parse('2026-10-10T06:00:00Z')+i*60000).toISOString(),open:String(p),high:String(p+.1),low:String(p-.1),close:String(p)}});
 const r=researchThirtyMinuteBounce(bars);assert.equal(r.results.length,27);assert.ok(r.results.every(x=>x.maxMinutes===30&&x.long.side==='LONG'&&x.short.side==='SHORT'));assert.deepEqual(r,researchThirtyMinuteBounce(bars));
});
test('bounce research endpoint is read only and chronological',()=>{
 const src=readFileSync('src/index.ts','utf8');assert.ok(src.includes("req.url==='/api/bounce30'"));assert.ok(src.includes('researchThirtyMinuteBounce(rows.slice(split))'));assert.ok(src.includes("noOrders:true"));
});
