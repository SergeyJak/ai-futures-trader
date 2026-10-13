import test from 'node:test';
import assert from 'node:assert/strict';
import {convertV6ClosedRow} from '../src/v6-real-history-oos.js';
const now=Date.parse('2026-10-11T20:00:00Z');
const row={id:'t|SOLUSDT|LONG|entry|exit',trader_id:'t',symbol:'SOLUSDT',side:'LONG',opened_time:String(now),closed_time:String(now+3600000),entry_price:'100',exit_price:'102',status:'CLOSED',entry_close:99,previous_minute:98,prior_close:100,entry_lag:20,prior_lag:20,minute_spacing:60};
test('accepts complete closed history and classifies completed candles',()=>{
 const result=convertV6ClosedRow(row);
 assert.equal(result?.pattern,'dip_reversal');
 assert.equal(result?.entry,100);
 assert.equal(result?.exit,102);
});
test('rejects open snapshots, partial fills, missing prices and stale candles',()=>{
 assert.equal(convertV6ClosedRow({...row,status:'PARTIALLY_CLOSED'}),null);
 assert.equal(convertV6ClosedRow({...row,closed_time:''}),null);
 assert.equal(convertV6ClosedRow({...row,exit_price:''}),null);
 assert.equal(convertV6ClosedRow({...row,entry_lag:240}),null);
 assert.equal(convertV6ClosedRow({...row,minute_spacing:120}),null);
});
test('does not use the unfinished entry minute',()=>{
 assert.equal(convertV6ClosedRow({...row,entry_close:null}),null);
});

test('entry classification covers all 341 closed rows rather than truncating at 300',async()=>{
 const {studyV6Entries,V6_ENTRY_STUDY_LIMIT}=await import('../src/v6-entry-study.js');
 const rows=Array.from({length:341},(_,i)=>({trader_id:'trader-'+i,symbol:'SOLUSDT',side:'LONG',opened_time:String(now+i*60000),closed_time:String(now+i*60000+60000),update_time:'1',entry:99,prev:100,previous_minute:98,entry_lag_seconds:0,prior_lag_seconds:0,minute_spacing_seconds:60}));
 let sql='';
 const pool={query:async(q:string)=>{sql=q;return {rows}}} as unknown as Parameters<typeof studyV6Entries>[0];
 const result=await studyV6Entries(pool);
 assert.equal(V6_ENTRY_STUDY_LIMIT,5000);
 assert.match(sql,/LIMIT 5000/);
 assert.match(sql,/kind='history'/);
 assert.equal(result.sample.closedHistoryRowsExamined,341);
 assert.equal(result.patternStudy.patterns.dip_reversal,341);
 assert.equal(result.traders.length,341);
});
