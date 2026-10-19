import test from 'node:test';
import assert from 'node:assert/strict';
import {v8Signal,v8Backtest} from '../src/v8-liquidity-sweep.js';
const bar=(i:number,open=100,high=101,low=99,close=100)=>({time:i*60000,open,high,low,close});
test('long reclaim requires sweep and close back above range',()=>{
 const bars=Array.from({length:12},(_,i)=>bar(i));
 assert.equal(v8Signal([...bars,bar(12,99.5,100.8,98,100.6)])?.side,'LONG');
 assert.equal(v8Signal([...bars,bar(12,99.5,100,98,98.5)]),null);
});
test('short reclaim and no future-bar execution',()=>{
 const bars=Array.from({length:12},(_,i)=>bar(i));
 assert.equal(v8Signal([...bars,bar(12,100.5,102,99,99.4)])?.side,'SHORT');
 const sample=[...bars,bar(12,99.5,100.8,98,100.6),bar(13,100,102,99,101)];
 const result=v8Backtest(sample,{holdBars:1});
 assert.equal(result.trades,1);
 assert.equal(result.records[0].entryAt,13*60000);
 assert.equal(result.realOrders,false);
 assert.equal(result.records[0].reason,'TAKE');
 assert.ok(Number.isFinite(result.records[0].netReturnPct));
});
test('missing sample reports unknown average',()=>{
 const result=v8Backtest(Array.from({length:12},(_,i)=>bar(i)));
 assert.equal(result.averageNetReturnPct,null);
});
