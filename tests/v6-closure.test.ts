import test from 'node:test';
import assert from 'node:assert/strict';
import {v6Insights,isFullyClosedHistory} from '../src/v6-insights.js';
test('partial history with closing PnL is not a completed trade',()=>{
 const x=v6Insights([
  {trader_id:'T',kind:'history',raw:{status:'PARTIALLY_CLOSED',closing_pnl:99,closed_time:null}},
  {trader_id:'T',kind:'history',raw:{status:'CLOSED',closing_pnl:3,closed_time:1767770600000}}
 ]);
 assert.equal(x.historyRecords,1);
 assert.equal(x.partialHistoryRecords,1);
 assert.equal(x.traders[0].reportedPnl,3);
 assert.equal(isFullyClosedHistory({status:'PARTIALLY_CLOSED',closed_time:1767770600000}),false);
});

test('repeated closure updates are not counted twice',()=>{
 const base={status:'CLOSED',symbol:'BTCUSDT',side:'LONG',opened_time:1767770000000,closed_time:1767770600000};
 const x=v6Insights([
  {trader_id:'T',kind:'history',raw:{...base,update_time:1767770600000,closing_pnl:4}},
  {trader_id:'T',kind:'history',raw:{...base,update_time:1767770800000,closing_pnl:5}}
 ]);
 assert.equal(x.historyRecords,1);
 assert.equal(x.duplicateHistoryRecords,1);
});
