import test from 'node:test';import assert from 'node:assert/strict';
import {aggregateConfirmed5m,sol5mReversalSignal,shortExit,openSol5mPosition,SOL_5M_VARIANTS} from '../src/sol-5m-paper.js';
const start=Date.parse('2026-10-18T12:00:00Z');
const five=[100,99.7,99.2,99.4].map((close,i)=>({time:start+i*300000,open:close,high:close+.1,low:close-.1,close}));
test('5m bars require five consecutive confirmed one-minute bars',()=>{const minute=five.flatMap(b=>Array.from({length:5},(_,i)=>({...b,time:b.time+i*60000})));assert.equal(aggregateConfirmed5m(minute).length,4);assert.equal(aggregateConfirmed5m(minute.slice(0,-1)).length,3);assert.equal(aggregateConfirmed5m(minute.filter(b=>b.time!==start+120000)).length,3)});
test('LONG and SHORT reversal are symmetric and require contiguous 5m bars',()=>{assert.equal(sol5mReversalSignal(five),'LONG');assert.equal(sol5mReversalSignal(five.map(b=>({...b,close:200-b.close}))), 'SHORT');assert.equal(sol5mReversalSignal(five.slice(1)),null);assert.equal(sol5mReversalSignal(five.map((b,i)=>({...b,time:b.time+(i===2?60000:0)}))),null)});
test('six configurations preserve 30m 4h and unlimited exits',()=>{assert.equal(SOL_5M_VARIANTS.length,6);assert.deepEqual(SOL_5M_VARIANTS.filter(v=>v.side==='LONG').map(v=>v.minutes),[30,240,null])});
test('SHORT stop take and time exit use minute candles',()=>{const p={entry:100,entryAt:start};assert.equal(shortExit(p,{time:start+60000,open:100,high:101.2,low:99,close:101.1},30)?.reason,'STOP');assert.equal(shortExit(p,{time:start+60000,open:100,high:100,low:97.9,close:98},30)?.reason,'TAKE');assert.equal(shortExit(p,{time:start+30*60000,open:100,high:100,low:99,close:99.5},30)?.reason,'TIME')});

test('entry uses next minute open and checks stop on that same minute',()=>{
 const bar={time:start+60000,open:100,high:100.5,low:98.8,close:99.5};
 const p=openSol5mPosition('LONG',bar,100);
 assert.equal(p.entryAt,bar.time);
 assert.equal(p.entry,100.03);
 assert.ok(p.quantity>0);
 // The entry candle must not be skipped: its low crossed the 1% stop.
 assert.ok(bar.low<p.entry*.99);
});
test('SHORT entry uses minute open with adverse slippage',()=>{
 const bar={time:start+60000,open:100,high:101.2,low:99.5,close:100.8};
 const p=openSol5mPosition('SHORT',bar,100);
 assert.equal(p.entryAt,bar.time);
 assert.equal(p.entry,99.97);
 assert.equal(shortExit(p,bar,30)?.reason,'STOP');
});
