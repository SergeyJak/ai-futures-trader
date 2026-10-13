import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyExit,strategySignal} from '../src/strategy-paper.js';
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
