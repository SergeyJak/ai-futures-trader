import test from 'node:test';
import assert from 'node:assert/strict';
import {replayV6Exit} from '../src/v6-exit-replay.js';
const t=Date.parse('2026-10-01T10:00:00Z');
const trade={openedMs:t,side:'LONG' as const,entry:100};
const bars=Array.from({length:30},(_,i)=>({startMs:t+i*60000,open:100,high:101,low:99,close:100}));
test('requires all thirty confirmed bars',()=>{assert.equal(replayV6Exit(trade,bars.slice(0,29),{kind:'time',minutes:30}).status,'insufficient_candles')});
test('deducts round-trip costs',()=>{const r=replayV6Exit(trade,bars,{kind:'time',minutes:30});assert.equal(r.status,'evaluated');if(r.status==='evaluated')assert.ok(Math.abs(r.netReturn+0.0018)<1e-10)});

test('stop takes precedence when both levels are reached',()=>{
 const r=replayV6Exit(trade,[{startMs:t,open:100,high:103,low:97,close:100}],{kind:'bracket',stopPct:0.02,takePct:0.02,maxMinutes:30});
 assert.equal(r.status,'evaluated');if(r.status==='evaluated'){assert.equal(r.reason,'both_hit_stop_first');assert.equal(r.exitPrice,98)}
});
test('gap through stop executes at worse opening price',()=>{
 const r=replayV6Exit(trade,[{startMs:t,open:95,high:96,low:94,close:95}],{kind:'bracket',stopPct:0.02,takePct:0.02,maxMinutes:30});
 assert.equal(r.status,'evaluated');if(r.status==='evaluated')assert.equal(r.exitPrice,95);
});
