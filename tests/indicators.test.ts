import test from 'node:test';import assert from 'node:assert/strict';import {ema,rsi,analyze} from '../src/indicators.js';
test('EMA seeds from SMA',()=>assert.equal(ema([1,2,3,4,5],3),4));
test('RSI returns 100 for rising and 0 for falling',()=>{assert.equal(rsi(Array.from({length:20},(_,i)=>i+1)),100);assert.equal(rsi(Array.from({length:20},(_,i)=>20-i)),0)});
test('flat RSI is neutral',()=>assert.equal(rsi(Array(20).fill(50)),50));
test('incomplete candles produce no actionable signal',()=>assert.equal(analyze([{close:'100',volume:'2'}]).signal,'INSUFFICIENT_DATA'));
test('invalid negative price rejected',()=>assert.throws(()=>analyze([{close:'-1',volume:'2'}])));
test('detects bullish watch with rising prices and elevated volume',()=>{
 const b=Array.from({length:40},(_,i)=>({close:String(100+i*.2),volume:i===39?'300':'100'}));
 const a=analyze(b);assert.ok(a.ema9!==null&&a.ema21!==null);assert.equal(a.signal,'NEUTRAL');assert.equal(a.rsi14,100);
});
