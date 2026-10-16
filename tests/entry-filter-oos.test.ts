import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateEntryFilters,priorCandleFeatures,ENTRY_FILTER_CANDIDATES} from '../src/entry-filter-oos.js';
test('fixed OOS excludes training trades and reports net after supplied costs',()=>{
 const rows=[{at:'2026-10-01T00:00:00Z',symbol:'SOLUSDT',side:'LONG' as const,net:100,features:{volatility:0.001,trend5:-0.01}},{at:'2026-10-10T00:00:00Z',symbol:'SOLUSDT',side:'LONG' as const,net:-2,features:{volatility:0.001,trend5:-0.01}}];
 const r=evaluateEntryFilters(rows,ENTRY_FILTER_CANDIDATES,'2026-10-05T00:00:00Z',1);
 assert.equal(r[0].trainTrades,1);assert.equal(r[0].testTrades,1);assert.equal(r[0].testNet,-2);assert.equal(r[0].baselineNet,-2);
 assert.equal(r.find(x=>x.name==='uptrend')?.eligible,false);
});
test('entry features use only prior candles',()=>{
 const bars=Array.from({length:30},()=>({open:100,high:101,low:99,close:100}));
 assert.equal(priorCandleFeatures(bars).trend5,0);
 assert.throws(()=>priorCandleFeatures(bars.slice(1)),/30/);
});

test('selection ignores holdout outcome',()=>{
 const make=(net:number)=>[{at:'2026-10-01T00:00:00Z',symbol:'SOLUSDT',side:'LONG' as const,net:3,features:{volatility:.001,trend5:-.01}},{at:'2026-10-02T00:00:00Z',symbol:'SOLUSDT',side:'LONG' as const,net:-5,features:{volatility:.001,trend5:.01}},{at:'2026-10-10T00:00:00Z',symbol:'SOLUSDT',side:'LONG' as const,net,features:{volatility:.001,trend5:-.01}}];
 const a=evaluateEntryFilters(make(100),ENTRY_FILTER_CANDIDATES,'2026-10-05T00:00:00Z',1).find(x=>x.name==='downtrend')!;
 const b=evaluateEntryFilters(make(-100),ENTRY_FILTER_CANDIDATES,'2026-10-05T00:00:00Z',1).find(x=>x.name==='downtrend')!;
 assert.equal(a.selectedOnTrain,true);assert.equal(b.selectedOnTrain,true);assert.equal(a.trainMean,b.trainMean);assert.notEqual(a.testNet,b.testNet);
});
