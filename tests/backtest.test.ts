import test from 'node:test';import assert from 'node:assert/strict';import {backtest} from '../src/backtest.js';
const base=Date.parse('2026-01-01T00:00:00Z');
const bars=Array.from({length:100},(_,i)=>{const x=100+i*.01;return {start_at:new Date(base+i*60000).toISOString(),open:String(x),high:String(x+0.1),low:String(x-0.1),close:String(x+.01),volume:'100'}});
test('no trade means no imaginary profit',()=>{const x=backtest(bars);assert.equal(x.trades,0);assert.equal(x.equity,100);assert.equal(x.winRate,null)});
test('insufficient history remains safe',()=>{const x=backtest(bars.slice(0,10));assert.equal(x.trades,0);assert.equal(x.equity,100)});
test('reject inconsistent candle high low',()=>{const invalid=bars.map(x=>({...x}));invalid[35].low='1000';assert.throws(()=>backtest(invalid),/Invalid OHLC/)});
test('fee assumptions are included',()=>{const x=backtest(bars);assert.equal(x.feesPerSidePct,.06);assert.equal(x.slippagePerSidePct,.02)});
