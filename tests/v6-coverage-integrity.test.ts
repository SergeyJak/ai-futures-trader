import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {studyV6Entries} from '../src/v6-entry-study.js';

type Row={trader_id:string;symbol:string;side:string;opened_time:string;closed_time:string;update_time:string;entry:number|null;prev:number|null;entry_lag_seconds:number|null;prior_lag_seconds:number|null};
const row=(overrides:Partial<Row>={}):Row=>({
 trader_id:'trader1',symbol:'SOLUSDT',side:'LONG',opened_time:'1700000000000',
 closed_time:'1700001800000',update_time:'1700002000000',entry:99,prev:100,
 entry_lag_seconds:0,prior_lag_seconds:0,...overrides
});
const run=async(rows:Row[])=>{
 const pool={query:async(sql:string)=>{
  assert.match(sql,/confirmed=true/);
  assert.match(sql,/start_at\+interval '1 minute'<=t\.opened_at/);
  assert.match(sql,/start_at\+interval '1 minute'<=t\.opened_at-interval '15 minutes'/);
  return {rows};
 }} as unknown as pg.Pool;
 return studyV6Entries(pool);
};
test('V6 coverage counts valid dips and momentum without inventing missing samples',async()=>{
 const r=await run([row(),row({opened_time:'1700000060000',entry:101}),row({opened_time:'1700000120000',entry:null})]);
 assert.equal(r.traders[0].count,3);assert.equal(r.traders[0].covered,2);
 assert.equal(r.traders[0].against,1);assert.equal(r.traders[0].withTrend,1);
 assert.equal(r.traders[0].uncovered,1);assert.equal(r.coverage.reasons.missingEntryCandle,1);
});
test('V6 coverage detects missing prior candle',async()=>{
 const r=await run([row({prev:null})]);
 assert.equal(r.coverage.reasons.missingPriorCandle,1);assert.equal(r.traders[0].covered,0);
});
test('V6 rejects entry candle older than three minutes',async()=>{
 const r=await run([row({entry_lag_seconds:181})]);
 assert.equal(r.coverage.reasons.staleEntryCandle,1);
});
test('V6 rejects prior candle older than three minutes',async()=>{
 const r=await run([row({prior_lag_seconds:181})]);
 assert.equal(r.coverage.reasons.stalePriorCandle,1);
});
test('V6 rejects future candle and avoids lookahead',async()=>{
 const r=await run([row({entry_lag_seconds:-1})]);
 assert.equal(r.traders[0].covered,0);
 assert.equal(r.coverage.reasons.staleEntryCandle,1);
});
test('V6 rejects unknown side and invalid price',async()=>{
 const r=await run([row({side:'UNKNOWN'})]);
 assert.equal(r.coverage.reasons.invalidSideOrPrice,1);
});
test('V6 coverage does not count duplicate closed positions twice',async()=>{
 const r=await run([row({update_time:'1'}),row({update_time:'2'})]);
 assert.equal(r.traders[0].count,1);
});
test('V6 missing symbols are sorted by missing count',async()=>{
 const r=await run([row({entry:null}),row({symbol:'ETHUSDT',opened_time:'1700000060000',entry:null}),row({symbol:'ETHUSDT',opened_time:'1700000120000',entry:null})]);
 assert.deepEqual(r.coverage.missingBySymbol.map(x=>[x.symbol,x.count]),[['ETHUSDT',2],['SOLUSDT',1]]);
});
