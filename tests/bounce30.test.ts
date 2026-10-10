import test from 'node:test';import assert from 'node:assert/strict';import {researchThirtyMinuteBounce} from '../src/bounce30.js';import {readFileSync} from 'node:fs';
test('bounce research compares long and short with the same stop take horizons',()=>{
 const bars=Array.from({length:160},(_,i)=>{const p=i<35?100:99.6+Math.sin(i/8)*.18;return {start_at:new Date(Date.parse('2026-10-10T06:00:00Z')+i*60000).toISOString(),open:String(p),high:String(p+.1),low:String(p-.1),close:String(p)}});
 const r=researchThirtyMinuteBounce(bars);assert.equal(r.results.length,27);assert.ok(r.results.every(x=>x.maxMinutes===30&&x.long.side==='LONG'&&x.short.side==='SHORT'));assert.deepEqual(r,researchThirtyMinuteBounce(bars));
});
test('bounce research endpoint is read only and chronological',()=>{
 const src=readFileSync('src/index.ts','utf8');assert.ok(src.includes("req.url==='/api/bounce30'"));assert.ok(src.includes('researchThirtyMinuteBounce(rows.slice(split))'));assert.ok(src.includes("noOrders:true"));
});

test('entry-minute stop is counted for both directions, even without following-minute movement',()=>{
 const base=Date.parse('2026-10-10T06:00:00Z');
 const rows=Array.from({length:95},(_,i)=>({start_at:new Date(base+i*60000).toISOString(),open:'100',high:'100.01',low:'99.99',close:'100'}));
 // Keep prior 30-minute peak 100 and cross 0.2% drawdown on candle 30.
 rows[30]={...rows[30],open:'100',high:'100.01',low:'98.8',close:'99.5'};
 const r=researchThirtyMinuteBounce(rows);
 const cfg=r.results.find(x=>x.dipPct===0.2&&x.stopPct===0.2&&x.takePct===0.3);
 assert.ok(cfg);assert.ok(cfg.long.exits.stop>=1,'long must stop on the entry candle');
 assert.ok(cfg.short.exits.stop>=1,'short conservative worst-case bound must stop on same minute');
});
