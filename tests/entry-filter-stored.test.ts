import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateStoredEntryFilters} from '../src/entry-filter-stored.js';
test('stored OOS excludes incomplete and non-contiguous pre-entry candles',async()=>{
 let calls=0;
 const pool={query:async(sql:string)=>{calls++;if(sql.includes('FROM v3_trades'))return {rows:[{config_id:'x',symbol:'SOLUSDT',side:'LONG',at:'2026-10-10T00:00:00Z',exited_at:'2026-10-10T01:00:00Z',net:-0.05}]};
 if(sql.includes('FROM market_candles'))return {rows:Array.from({length:29},()=>({at:'2026-10-09T23:59:00Z',open:100,high:101,low:99,close:100}))};
 throw Error('unexpected SQL');}} as any;
 const result=await evaluateStoredEntryFilters(pool,'v3','2026-10-05T00:00:00Z',1);
 assert.equal(result.loadedTrades,1);assert.equal(result.usableTrades,0);assert.equal(result.missingHistory,1);assert.equal(result.scores[0].eligible,false);assert.equal(calls,2);
});
test('stored OOS never includes the entry candle in features',async()=>{
 const at=Date.parse('2026-10-10T00:00:00Z');
 const candles=Array.from({length:30},(_,i)=>({at:new Date(at-(i+1)*60000).toISOString(),open:100,high:101,low:99,close:100}));
 const pool={query:async(sql:string)=>sql.includes('FROM v4_trades')?{rows:[{config_id:'x',symbol:'SOLUSDT',side:'SHORT',at:new Date(at).toISOString(),exited_at:'2026-10-10T01:00:00Z',net:-0.1}]}:{rows:candles}} as any;
 const result=await evaluateStoredEntryFilters(pool,'v4','2026-10-05T00:00:00Z',1);
 assert.equal(result.usableTrades,1);assert.equal(result.scores[0].testNet,-0.1);
});
test('many trades on one symbol require only one candle query',async()=>{
 let candleQueries=0;
 const at=Date.parse('2026-10-10T00:00:00Z');
 const candles=Array.from({length:30},(_,i)=>({at:new Date(at-(30-i)*60000).toISOString(),open:100,high:101,low:99,close:100}));
 const pool={query:async(sql:string)=>{if(sql.includes('FROM v3_trades'))return {rows:Array.from({length:20},()=>({symbol:'BTCUSDT',side:'LONG',at:new Date(at).toISOString(),exited_at:'2026-10-10T01:00:00Z',net:-0.1}))};candleQueries++;return {rows:candles};}} as any;
 const r=await evaluateStoredEntryFilters(pool,'v3','2026-10-05T00:00:00Z',1);
 assert.equal(r.usableTrades,20);assert.equal(candleQueries,1);
});

test('fixed OOS query excludes open, unresolved, future and cross-cutoff training trades',async()=>{
 let sql='';const pool={query:async(q:string)=>{if(q.includes('FROM v3_trades')){sql=q;return {rows:[]}}throw Error('unexpected candle query')}} as any;
 const result=await evaluateStoredEntryFilters(pool,'v3','2026-10-05T00:00:00Z',1);
 assert.match(sql,/exit_at IS NOT NULL AND pnl IS NOT NULL/);
 assert.match(sql,/exit_at <= \$1::timestamptz \+ interval '7 days'/);
 assert.match(sql,/entry_at >= \$1::timestamptz OR exit_at < \$1::timestamptz/);
 assert.equal(result.loadedTrades,0);
});
test('fixed OOS rejects invalid outcome timestamps and non-finite net',async()=>{
 const at='2026-10-10T00:00:00Z';const pool={query:async(q:string)=>q.includes('FROM v4_trades')?{rows:[{symbol:'SOLUSDT',side:'LONG',at,exited_at:'2026-10-09T00:00:00Z',net:1},{symbol:'SOLUSDT',side:'LONG',at,exited_at:'2026-10-10T01:00:00Z',net:'NaN'}]}:{rows:[]}} as any;
 const r=await evaluateStoredEntryFilters(pool,'v4','2026-10-05T00:00:00Z',1);
 assert.equal(r.invalidOutcomes,2);assert.equal(r.usableTrades,0);
});
