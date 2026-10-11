import test from 'node:test';
import assert from 'node:assert/strict';
import {selectV6BackfillTargets} from '../src/v6-selective-backfill.js';
const now=Date.parse('2026-10-11T20:00:00Z');
test('only valid, mature USDT futures and deduplicate hourly windows',()=>{
 const rows=[
 {symbol:'HYPEUSDT',openedMs:now-3600000},
 {symbol:'HYPEUSDT',openedMs:now-3500000},
 {symbol:'ZECUSDT',openedMs:now-7200000},
 {symbol:'BAD/USD',openedMs:now-3600000},
 {symbol:'SOLUSDT',openedMs:now+60000},
 {symbol:'ETHUSDT',openedMs:now-91*86400000},
 ];
 assert.deepEqual(selectV6BackfillTargets(rows,now),[
 {symbol:'HYPEUSDT',openedMs:now-3600000},
 {symbol:'ZECUSDT',openedMs:now-7200000},
 ]);
});
test('limits external fetch workload',()=>{
 const rows=Array.from({length:12},(_,i)=>({symbol:'ZECUSDT',openedMs:now-(i+1)*3600000}));
 assert.equal(selectV6BackfillTargets(rows,now,2).length,2);
});
