import test from 'node:test';
import assert from 'node:assert/strict';
import {v8Backtest, type V8Bar} from '../src/v8-liquidity-sweep.js';

const bar=(i:number,open=100,high=101,low=99,close=100):V8Bar=>({time:i*60_000,open,high,low,close});
const setup=()=>[...Array.from({length:12},(_,i)=>bar(i)),bar(12,99.5,100.8,98,100.6)];
const flat=(n:number)=>[...setup(),...Array.from({length:n},(_,i)=>bar(i+13,100,101,99,100))];

test('V8 default horizon means 24 elapsed hours, not 24 candles',()=>{
 const bars=flat(1442);
 const result=v8Backtest(bars);
 assert.equal(result.trades,1);
 assert.equal(result.records[0].reason,'TIME');
 assert.equal(result.records[0].entryAt,13*60_000);
 assert.equal(result.records[0].exitAt,(13+1440)*60_000);
 assert.equal(result.realOrders,false);
});

test('V8 excludes unclosed positions at the data boundary from realized statistics',()=>{
 const result=v8Backtest(flat(24));
 assert.equal(result.trades,0);
 assert.equal(result.records.length,0);
 assert.equal(result.netReturnPctSum,0);
 assert.equal(result.averageNetReturnPct,null);
 assert.equal(result.winRate,null);
});

test('V8 excludes positions interrupted by a candle gap',()=>{
 const bars=flat(20);
 bars[18]={...bars[18],time:bars[17].time+120_000};
 const result=v8Backtest(bars);
 assert.equal(result.trades,0);
 assert.equal(result.records.length,0);
});

test('V8 still realizes stop exits before the 24-hour horizon and includes costs',()=>{
 const bars=[...setup(),bar(13,100,100.5,97,98)];
 const result=v8Backtest(bars);
 assert.equal(result.trades,1);
 assert.equal(result.records[0].reason,'STOP');
 assert.ok(result.records[0].netReturnPct<0);
});

test('V8 rejects ambiguous hold units',()=>{
 assert.throws(()=>v8Backtest(flat(25),{holdBars:24,holdMinutes:1440}),/Invalid V8 costs or hold/);
});

// A missing 5m candle must not turn a sparse history into a valid sweep signal.
test('V8 rejects noncontiguous signal history even when next candle is present',()=>{
 const bars=setup();
 bars[5]={...bars[5],time:bars[5].time+30_000};
 const result=v8Backtest([...bars,bar(13,100,100.5,97,98)],{holdBars:1});
 assert.equal(result.trades,0);
});

test('V8 rejects uniformly sparse bars when the expected 5m cadence is explicit',()=>{
 const bars=[...setup(),bar(13,100,100.5,97,98)].map(b=>({...b,time:b.time*10}));
 assert.equal(v8Backtest(bars,{holdBars:1,expectedBarMinutes:5}).trades,0);
 assert.equal(v8Backtest(bars,{holdBars:1,expectedBarMinutes:10}).trades,1);
 assert.throws(()=>v8Backtest(bars,{expectedBarMinutes:0}),/Invalid V8 costs or hold/);
});
