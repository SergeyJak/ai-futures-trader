import test from 'node:test';
import assert from 'node:assert/strict';
import {studyV6Entries,V6_ENTRY_STUDY_LIMIT} from '../src/v6-entry-study.js';
test('V6 entry study scans up to 5000 chronologically selected closed histories',async()=>{
 const rows=Array.from({length:341},(_,i)=>({trader_id:'t1',symbol:'SOLUSDT',side:'LONG',opened_time:String(1760000000000+i*60000),closed_time:String(1760000030000+i*60000),update_time:String(i),entry:100,prev:99,previous_minute:99.5,minute_spacing_seconds:60,entry_lag_seconds:0,prior_lag_seconds:0}));
 const pool={query:async(sql:string)=>{assert.match(sql,/kind='history'/);assert.match(sql,/PARTIAL\|OPEN\|ACTIVE\|PENDING/);assert.match(sql,/ORDER BY t\.opened_at ASC LIMIT 5000/);return {rows}}};
 const report=await studyV6Entries(pool as never);
 assert.equal(V6_ENTRY_STUDY_LIMIT,5000);
 assert.equal(report.sample.closedHistoryRowsExamined,341);
 assert.equal(report.patternStudy.eligible,341);
 assert.equal(report.patternStudy.patterns.momentum_continuation,341);
});
