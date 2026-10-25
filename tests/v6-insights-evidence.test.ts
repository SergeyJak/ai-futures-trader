import test from 'node:test';
import assert from 'node:assert/strict';
import {isFullyClosedHistory,v6Insights} from '../src/v6-insights.js';
import {summarizeV6HoldingCohorts} from '../src/v6-holding-cohorts.js';

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


test('V6 uses the central pair for even-sized holding and leverage medians',()=>{
 const holds=[10,10,10,3000,3000,3000],leverages=[1,2,3,7,8,9];
 const rows=holds.map((minutes,i)=>{
  const opened=Date.parse('2026-10-10T00:00:00Z')+i*3600000;
  return {trader_id:'even',kind:'history',raw:{...valid,opened_time:opened,closed_time:opened+minutes*60000,leverage:leverages[i],closed_volume:1,avg_entry_price:100,avg_close_price:101}};
 });
 const report=v6Insights(rows);
 assert.equal(report.traders[0].medianHoldMinutes,1505);
 assert.equal(report.traders[0].medianLeverage,5);
 assert.equal(summarizeV6HoldingCohorts(report).cohorts.find(c=>c.style==='swing')?.closedPositions,6);
 assert.equal(summarizeV6HoldingCohorts(report).cohorts.find(c=>c.style==='multiday')?.closedPositions,0);
});

test('V6 ignores non-decimal provider PnL and fee inputs instead of coercing them',()=>{
 const rows=[
  {...valid,closing_pnl:'0x10',closed_volume:'0b10',avg_entry_price:100,avg_close_price:101},
  {...valid,opened_time:valid.opened_time+60000,closed_time:valid.closed_time+60000,closing_pnl:'1.2e2',closed_volume:'2',avg_entry_price:'100',avg_close_price:'101'},
 ];
 const report=v6Insights(rows.map(raw=>({trader_id:'numeric',kind:'history',raw})));
 assert.equal(report.historyRecords,2);
 assert.equal(report.traders[0].withPnl,1);
 assert.equal(report.traders[0].reportedPnl,120);
 assert.equal(report.traders[0].costCoverage,1);
 assert.equal(report.traders[0].estimatedNetBeforeSlippage,null);
});
