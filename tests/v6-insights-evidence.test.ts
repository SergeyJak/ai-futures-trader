import test from 'node:test';
import assert from 'node:assert/strict';
import {isFullyClosedHistory,v6Insights} from '../src/v6-insights.js';

const valid={status:'CLOSED',symbol:'SOLUSDT',side:'LONG',opened_time:1767770000000,closed_time:1767770600000,closing_pnl:'3.5'};

test('V6 descriptive cohorts exclude incomplete or impossible closed history',()=>{
 const invalid=[
  {...valid,side:undefined},{...valid,side:'SIDEWAYS'},{...valid,symbol:''},
  {...valid,opened_time:undefined},{...valid,opened_time:valid.closed_time},
  {...valid,opened_time:valid.closed_time+60000},{...valid,closed_time:'bad'},
  {...valid,status:'PARTIALLY_CLOSED'},
 ];
 for(const row of invalid)assert.equal(isFullyClosedHistory(row),false);
 const report=v6Insights([
  {trader_id:'trader',kind:'history',raw:valid},
  ...invalid.map(raw=>({trader_id:'trader',kind:'history',raw})),
 ]);
 assert.equal(report.historyRecords,1);
 assert.equal(report.traders[0].records,1);
 assert.equal(report.traders[0].reportedPnl,3.5);
 assert.equal(report.unclassifiedHistoryRecords,7);
 assert.equal(report.partialHistoryRecords,1);
});

test('V6 blank and boolean PnL are missing evidence, never zero or one',()=>{
 const records=[
  {...valid,closing_pnl:'   '},
  {...valid,opened_time:1767770100000,closed_time:1767770700000,closing_pnl:true},
  {...valid,opened_time:1767770200000,closed_time:1767770800000,closing_pnl:'2.5'},
 ];
 const report=v6Insights(records.map(raw=>({trader_id:'trader',kind:'history',raw})));
 assert.equal(report.historyRecords,3);
 assert.equal(report.traders[0].withPnl,1);
 assert.equal(report.traders[0].reportedPnl,2.5);
 assert.equal(report.traders[0].estimatedNetBeforeSlippage,null);
});

test('V6 deduplicates equivalent provider position clocks and side aliases without merging distinct positions',()=>{
 const first={...valid,closing_pnl:'2',update_time:'2026-10-08T00:00:00Z'};
 const samePosition={...valid,symbol:' solusdt ',side:'BUY',opened_time:valid.opened_time/1000,closed_time:new Date(valid.closed_time).toISOString(),closing_pnl:'3',update_time:'2026-10-09T00:00:00Z'};
 const separateSide={...valid,side:'SHORT',closing_pnl:'4'};
 const report=v6Insights([
  {trader_id:'trader',kind:'history',raw:first},
  {trader_id:'trader',kind:'history',raw:samePosition},
  {trader_id:'trader',kind:'history',raw:separateSide},
  {trader_id:'another',kind:'history',raw:{...valid,closing_pnl:'5'}},
 ]);
 assert.equal(report.rawHistoryRecords,4);
 assert.equal(report.historyRecords,3);
 assert.equal(report.duplicateHistoryRecords,1);
 const trader=report.traders.find(x=>x.trader==='trader');
 assert.equal(trader?.records,2);
 assert.equal(trader?.reportedPnl,7);
 assert.equal(report.traders.find(x=>x.trader==='another')?.reportedPnl,5);
});
