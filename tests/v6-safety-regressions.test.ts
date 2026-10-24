import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyV6Entry,deduplicateV6EntryRows} from '../src/v6-entry-study.js';
import {isFullyClosedHistory,v6Insights} from '../src/v6-insights.js';
import {microQuantity} from '../src/experiments.js';

test('V6 entries classify long and short dip vs momentum',()=>{
 assert.equal(classifyV6Entry('LONG',99,100),'dip');
 assert.equal(classifyV6Entry('LONG',101,100),'momentum');
 assert.equal(classifyV6Entry('SHORT',101,100),'dip');
 assert.equal(classifyV6Entry('SHORT',99,100),'momentum');
 assert.equal(classifyV6Entry('SELL',100,100),'flat');
});
test('V6 rejects missing or invalid entry prices and unknown sides',()=>{
 for(const value of [null,0,-1,Number.NaN,Number.POSITIVE_INFINITY]){
  assert.equal(classifyV6Entry('LONG',value,100),'unknown');
 }
 assert.equal(classifyV6Entry('SIDEWAYS',99,100),'unknown');
 assert.equal(classifyV6Entry('SHORT',100,null),'unknown');
});
test('V6 entry deduplication keeps newest observation and distinct positions',()=>{
 const base={trader_id:'t',symbol:'SOLUSDT',side:'LONG',opened_time:'100',closed_time:'200'};
 const rows=[{...base,update_time:'1',tag:'old'},{...base,update_time:'2',tag:'new'},{...base,closed_time:'300',update_time:'1',tag:'other'}];
 const result=deduplicateV6EntryRows(rows);
 assert.equal(result.length,2);
 assert.equal(result.find(x=>x.closed_time==='200')?.tag,'new');
});
test('V6 excludes partial and open position snapshots',()=>{
 assert.equal(isFullyClosedHistory({status:'PARTIAL',closed_time:1700000000000}),false);
 assert.equal(isFullyClosedHistory({status:'OPEN',closed_time:1700000000000}),false);
 assert.equal(isFullyClosedHistory({status:'CLOSED'}),false);
 assert.equal(isFullyClosedHistory({status:'CLOSED',symbol:'SOLUSDT',side:'LONG',opened_time:1699999940000,closed_time:1700000000000}),true);
});
test('V6 insights do not count open snapshots as closed profit',()=>{
 const item={trader_id:'t',kind:'open',raw:{status:'OPEN',closing_pnl:99999,closed_time:1700000000000}};
 const report=v6Insights([item]);
 assert.equal(report.historyRecords,0);
 assert.equal(report.openSnapshots,1);
});
test('micro quantity never trades with invalid balance or price',()=>{
 for(const balance of [0,-1,Number.NaN])assert.equal(microQuantity('SOLUSDT',100,balance),0);
 for(const price of [0,-100,Number.NaN])assert.equal(microQuantity('SOLUSDT',price,100),0);
 assert.equal(microQuantity('UNKNOWN',100,100),0);
 assert.equal(microQuantity('SOLUSDT',100,100,5,6),0);
});
test('micro quantity respects configured margin and balance limits',()=>{
 const qty=microQuantity('SOLUSDT',100,100,5,5,.004,.002);
 assert.ok(qty>=0);
 assert.ok(qty*100/5+qty*100*.0006<=100+1e-8);
 assert.ok(qty*100<=25+1e-8);
});
