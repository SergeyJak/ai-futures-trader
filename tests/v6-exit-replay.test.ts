import test from 'node:test';
import assert from 'node:assert/strict';
import {replayV6Exit} from '../src/v6-exit-replay.js';
const t=Date.parse('2026-10-01T10:00:00Z');
const trade={openedMs:t,side:'LONG' as const,entry:100};
const bars=Array.from({length:30},(_,i)=>({startMs:t+i*60000,open:100,high:101,low:99,close:100}));
test('requires all thirty confirmed bars',()=>{assert.equal(replayV6Exit(trade,bars.slice(0,29),{kind:'time',minutes:30}).status,'insufficient_candles')});
test('deducts round-trip costs',()=>{const r=replayV6Exit(trade,bars,{kind:'time',minutes:30});assert.equal(r.status,'evaluated');if(r.status==='evaluated')assert.ok(Math.abs(r.netReturn+0.0018)<1e-10)});
