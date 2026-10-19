import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateV8Bars} from '../src/v8-candle-aggregation.js';
test('clock alignment',()=>{const bars=Array.from({length:205},(_,i)=>({time:(i+5)*60000,open:100,high:101,low:99,close:100}));assert.equal(aggregateV8Bars(bars,15).length,13);});
