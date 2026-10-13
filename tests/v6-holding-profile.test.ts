import test from 'node:test';
import assert from 'node:assert/strict';
import {studyV6Entries} from '../src/v6-entry-study.js';

test('holding distribution uses deduplicated closed history and excludes invalid durations',async()=>{
 const durations=[10,30,240,1440,-1];
 const rows=durations.map((minutes,i)=>{
  const opened=1760000000000+i*3600000;
  return {trader_id:'t1',symbol:'SOLUSDT',side:'LONG',opened_time:String(opened),closed_time:String(opened+minutes*60000),update_time:String(i),entry:100,prev:99,previous_minute:99.5,minute_spacing_seconds:60,entry_lag_seconds:0,prior_lag_seconds:0};
 });
 const pool={query:async(sql:string)=>{assert.match(sql,/kind='history'/);assert.match(sql,/PARTIAL/);return {rows}}};
 const report=await studyV6Entries(pool as never);
 assert.equal(report.holding.valid,4);
 assert.equal(report.holding.invalid,1);
 assert.equal(report.holding.under30m,1);
 assert.equal(report.holding.from30mTo4h,1);
 assert.equal(report.holding.from4hTo24h,1);
 assert.equal(report.holding.over24h,1);
 assert.equal(report.holding.medianMinutes,30);
 assert.equal(report.holding.p90Minutes,1440);
});
