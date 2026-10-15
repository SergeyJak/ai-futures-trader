import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateV7} from '../src/v7-backtest.js';
test('flat series produces no phantom trades and no gain',()=>{const t=1800000000000;const bars=Array.from({length:60},(_,i)=>({time:t+i*300000,open:100,high:100.1,low:99.9,close:100,volume:100}));const r=evaluateV7(bars);assert.equal(r.trades,0);assert.equal(r.balance,100);assert.equal(r.winRate,null)});
test('backtest reports gaps rather than inventing bar fills',()=>{const t=1800000000000;const bars=Array.from({length:40},(_,i)=>({time:t+(i+(i>=35?1:0))*300000,open:100,high:101,low:99,close:100,volume:50}));assert.equal(evaluateV7(bars).skippedGaps,1)});
