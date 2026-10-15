import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyExit,strategySignal,fillPendingAtNextOpen,NEXT_OPEN_MODEL} from '../src/strategy-paper.js';
const minute=60_000;
test('first eligible candle immediately after entry can trigger stop',()=>{
 const entryAt=1_760_000_000_000;
 const position={entry:100,entryAt,quantity:1,side:'LONG' as const};
 const first={time:entryAt,open:100,high:100.3,low:98.8,close:99.5};
 assert.deepEqual(strategyExit(position,first,30),{price:99,reason:'STOP'});
 assert.equal(first.time>=position.entryAt,true);
});
test('same-minute stop and take use pessimistic stop first',()=>{
 const p={entry:100,entryAt:1_760_000_000_000,quantity:1,side:'LONG' as const};
 assert.deepEqual(strategyExit(p,{time:p.entryAt,open:100,high:103,low:98,close:101},null),{price:99,reason:'BOTH_STOP_FIRST'});
});
test('short positions respect first-candle stop gap',()=>{
 const p={entry:100,entryAt:1_760_000_000_000,quantity:1,side:'SHORT' as const};
 assert.deepEqual(strategyExit(p,{time:p.entryAt,open:102,high:103,low:101,close:102},240),{price:102,reason:'STOP'});
});
test('signal requires enough confirmed bars',()=>{
 const bars=Array.from({length:15},(_,i)=>({time:i*minute,open:100,high:101,low:99,close:100}));
 assert.equal(strategySignal('dip_reversal',bars),null);
});

test('pending signal enters at NEXT confirmed open, never the signal close',()=>{
 const signalAt=1_760_000_000_000;
 const bar={time:signalAt+minute,open:101,high:105,low:99,close:104};
 const p=fillPendingAtNextOpen({side:'LONG',signalAt},bar,100);
 assert.ok(p);assert.equal(p.entry,101*(1+.0003));assert.equal(p.entryAt,bar.time);
 assert.equal(p.quantity,10/p.entry);assert.equal(p.executionModel,NEXT_OPEN_MODEL);
 assert.notEqual(p.entry,bar.close*(1+.0003));
});
test('stale pending signals never fill across missed candles or on the signal bar',()=>{
 const signalAt=1_760_000_000_000,bar={time:signalAt,open:100,high:101,low:99,close:100};
 assert.equal(fillPendingAtNextOpen({side:'LONG',signalAt},bar,100),null);
 assert.equal(fillPendingAtNextOpen({side:'LONG',signalAt},{...bar,time:signalAt+2*minute},100),null);
 assert.equal(fillPendingAtNextOpen({side:'LONG',signalAt},{...bar,time:signalAt+minute},0),null);
});
test('next-open short fill and same-candle stop remain conservative',()=>{
 const signalAt=1_760_000_000_000,bar={time:signalAt+minute,open:100,high:103,low:98,close:101};
 const p=fillPendingAtNextOpen({side:'SHORT',signalAt},bar,100);
 assert.ok(p);assert.equal(p.entry,100*(1-.0003));
 assert.equal(strategyExit(p,bar,null)?.reason,'BOTH_STOP_FIRST');
 assert.equal(strategyExit(p,bar,null)?.price,p.entry*(1+.01));
});
test('time exit uses the end of the confirmed candle',()=>{
 const entryAt=1_760_000_000_000;
 const p={entry:100,entryAt,quantity:1,side:'LONG' as const};
 const bar={time:entryAt+239*minute,open:100,high:100.5,low:99.5,close:100.2};
 assert.deepEqual(strategyExit(p,bar,240),{price:100.2,reason:'TIME'});
});
