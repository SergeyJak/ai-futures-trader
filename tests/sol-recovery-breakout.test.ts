import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryBacktest,type Bar} from '../src/sol-recovery-breakout.js';
const bars:Bar[]=Array.from({length:300},(_,i)=>({time:i*60000,open:100,high:101,low:99,close:100,volume:10}));
test('no false signals in flat market',()=>assert.deepEqual(recoveryBacktest(bars),[]));
test('gapped candle data rejected',()=>{const b=bars.map(x=>({...x}));b[100].time+=1000;assert.deepEqual(recoveryBacktest(b),[])});
test('bad OHLC data rejected',()=>{const b=bars.map(x=>({...x}));b[100].low=102;assert.deepEqual(recoveryBacktest(b),[])});
