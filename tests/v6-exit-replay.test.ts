import test from 'node:test';
import assert from 'node:assert/strict';
import {replayV6Exit,type ExitCandle} from '../src/v6-exit-replay.js';
const start=Date.parse('2026-10-01T10:00:00Z');
const trade={openedMs:start,side:'LONG' as const,entry:100};
const candles=(n:number,close=101):ExitCandle[]=>Array.from({length:n},(_,i)=>({startMs:start+i*60000,open:100,high:Math.max(100,close),low:Math.min(100,close),close}));
test('30 minute exit charges both fees and slippage',()=>{
 const r=replayV6Exit(trade,candles(30),{kind:'time',minutes:30});
 assert.equal(r.status,'evaluated');
 if(r.status==='evaluated'){assert.equal(r.exitMs,start+30*60000);assert.ok(Math.abs(r.netReturn-0.0082)<1e-10)}
});
test('four hour exit requires complete 240-minute series',()=>{
 assert.equal(replayV6Exit(trade,candles(239),{kind:'time',minutes:240}).status,'insufficient_candles');
 assert.equal(replayV6Exit(trade,candles(240),{kind:'time',minutes:240}).status,'evaluated');
});
test('both bracket levels touched resolves conservatively to stop',()=>{
 const cs=[{startMs:start,open:100,high:103,low:97,close:101}];
 const r=replayV6Exit(trade,cs,{kind:'bracket',stopPct:0.02,takePct:0.02,maxMinutes:30});
 assert.equal(r.status,'evaluated');
 if(r.status==='evaluated'){assert.equal(r.reason,'both_hit_stop_first');assert.equal(r.exitPrice,98);assert.ok(r.netReturn<0)}
});
test('stop gap uses worse opening execution',()=>{
 const r=replayV6Exit(trade,[{startMs:start,open:95,high:96,low:94,close:95}],{kind:'bracket',stopPct:0.02,takePct:0.02,maxMinutes:30});
 assert.equal(r.status,'evaluated');
 if(r.status==='evaluated')assert.equal(r.exitPrice,95);
});
test('missing minute and partial entry minute are never interpolated',()=>{
 assert.equal(replayV6Exit(trade,[...candles(10),...candles(20).map(c=>({...c,startMs:c.startMs+11*60000}))],{kind:'time',minutes:30}).status,'insufficient_candles');
 assert.equal(replayV6Exit({...trade,openedMs:start+30000},candles(30),{kind:'time',minutes:30}).status,'insufficient_candles');
});
test('short bracket stop and take direction',()=>{
 const r=replayV6Exit({...trade,side:'SHORT'},[{startMs:start,open:100,high:101,low:97,close:99}],{kind:'bracket',stopPct:0.02,takePct:0.02,maxMinutes:30});
 assert.equal(r.status,'evaluated');
 if(r.status==='evaluated'){assert.equal(r.reason,'take');assert.equal(r.exitPrice,98)}
});

test('duplicate confirmed minute candles invalidate replay instead of silently choosing last',()=>{
 const cs=candles(30);
 const duplicate={...cs[5],close:100.5};
 assert.equal(replayV6Exit(trade,[...cs,duplicate],{kind:'time',minutes:30}).status,'insufficient_candles');
 // Duplicates outside the requested window cannot affect the evaluated exit.
 assert.equal(replayV6Exit(trade,[...cs,{...cs[0],startMs:start+40*60000}],{kind:'time',minutes:30}).status,'evaluated');
});
test('non-finite costs and impossible bracket targets are invalid input',()=>{
 for(const value of [NaN,Infinity,-Infinity,-0.01]){
  assert.equal(replayV6Exit(trade,candles(30),{kind:'time',minutes:30},{feePerSide:value,slippagePerSide:0.0003,trainFraction:0.7,minimumTrain:30,minimumTest:15}).status,'invalid_input');
  assert.equal(replayV6Exit(trade,candles(30),{kind:'time',minutes:30},{feePerSide:0.0006,slippagePerSide:value,trainFraction:0.7,minimumTrain:30,minimumTest:15}).status,'invalid_input');
 }
 assert.equal(replayV6Exit(trade,candles(30),{kind:'bracket',stopPct:0.02,takePct:1,maxMinutes:30}).status,'invalid_input');
});
