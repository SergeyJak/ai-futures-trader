import test from 'node:test';
import assert from 'node:assert/strict';
import {chronologicalHoldout,scoreClosedTrade,summarizeReturns,DEFAULT_OOS_CONFIG,type CompletedTrade} from '../src/v6-oos-backtest.js';
const day=86400000;
const trade=(i:number,pattern:CompletedTrade['pattern']='dip_reversal',entry=100,exit=101):CompletedTrade=>({id:String(i),openedMs:i*day,closedMs:i*day+3600000,pattern,side:'LONG',entry,exit});
test('fees and slippage charged on both sides, including losses',()=>{
 const scored=scoreClosedTrade(trade(1));
 assert.ok(Math.abs(scored.netReturn-(0.01-0.0018))<1e-12);
 const short=scoreClosedTrade({...trade(2),side:'SHORT'});
 assert.ok(short.netReturn<0);
});
test('no test-set pattern selection and chronological holdout',()=>{
 const rows=Array.from({length:100},(_,i)=>trade(i,i%2===0?'dip_reversal':'momentum_continuation',100,i<70?(i%2===0?103:98):(i%2===0?90:110)));
 const r=chronologicalHoldout(rows);
 assert.equal(r.status,'evaluated');
 if(r.status!=='evaluated')return;
 assert.equal(r.selectedPattern,'dip_reversal');
 assert.equal(r.testCount,30);
 assert.ok((r.test.meanNetReturn??0)<0);
 assert.equal(r.holdoutStartMs,70*day);
});
test('purges training positions that overlap test boundary',()=>{
 const rows=Array.from({length:100},(_,i)=>trade(i));
 rows[69]={...rows[69],closedMs:72*day};
 const r=chronologicalHoldout(rows);
 assert.equal(r.status,'evaluated');
 if(r.status==='evaluated')assert.equal(r.trainCount,69);
});
test('small sample cannot claim out-of-sample result',()=>{
 const r=chronologicalHoldout(Array.from({length:31},(_,i)=>trade(i)));
 assert.equal(r.status,'insufficient_data');
});
test('duplicate trade IDs are excluded, empty profit factor is null',()=>{
 const rows=Array.from({length:100},(_,i)=>trade(i));
 const r=chronologicalHoldout([...rows,rows[0]]);
 assert.equal(r.status,'evaluated');
 assert.equal(summarizeReturns([]).profitFactor,null);
});
test('rejects invalid timestamps and prices',()=>{
 assert.throws(()=>scoreClosedTrade({...trade(1),exit:0}),/Invalid closed trade/);
 assert.throws(()=>scoreClosedTrade({...trade(1),closedMs:day}),/Invalid closed trade/);
 assert.equal(DEFAULT_OOS_CONFIG.feePerSide,0.0006);
});

test('selected pattern without enough holdout observations cannot be evaluated',()=>{
 const rows=Array.from({length:100},(_,i)=>trade(i,i<70?'dip_reversal':'momentum_continuation',100,102));
 const result=chronologicalHoldout(rows);
 assert.equal(result.status,'insufficient_data');
 if(result.status==='insufficient_data'){
  assert.equal(result.selectedPattern,'dip_reversal');
  assert.equal(result.selectedPatternTestCount,0);
 }
});
test('overall test count does not replace selected-pattern sample threshold',()=>{
 const rows=Array.from({length:100},(_,i)=>trade(i,i<70?'dip_reversal':i<80?'dip_reversal':'momentum_continuation',100,102));
 const result=chronologicalHoldout(rows);
 assert.equal(result.status,'insufficient_data');
 if(result.status==='insufficient_data')assert.equal(result.selectedPatternTestCount,10);
});
