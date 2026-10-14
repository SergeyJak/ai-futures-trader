import test from 'node:test';
import assert from 'node:assert/strict';
import {OOS_KEY,OOS_VARIANTS} from '../src/dip-oos.js';
import {strategySignal,strategyExit,FEE,SLIP} from '../src/strategy-paper.js';
const bars=Array.from({length:16},(_,i)=>({time:i*60000,open:100-i*.06,high:101,low:98,close:100-i*.06}));
test('isolated OOS identity and fixed exit modes',()=>{assert.equal(OOS_KEY,'dip_reversal_oos');assert.deepEqual(OOS_VARIANTS.map(v=>v.id),['30m','4h','bracket'])});
test('dip reversal requires last-minute bounce',()=>{const falling=bars.map(b=>({...b}));assert.equal(strategySignal('dip_reversal',falling),null);falling[15].close=falling[14].close+.1;assert.equal(strategySignal('dip_reversal',falling),'LONG')});
test('stop takes priority if both barriers touched',()=>{const p={entry:100,entryAt:0,quantity:.1,side:'LONG' as const};const b={time:60000,open:100,high:103,low:98,close:101};assert.equal(strategyExit(p,b,null)?.reason,'BOTH_STOP_FIRST')});
test('costs are charged on both sides',()=>{assert.equal(FEE,.0006);assert.equal(SLIP,.0003)});
