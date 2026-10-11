import test from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateV6EntryRows,classifyV6Entry} from '../src/v6-entry-study.js';
import {simulateDipReversal} from '../src/v6-paper-prototype.js';
test('deduplicates updates of the same closed position',()=>{
 const base={trader_id:'a',symbol:'BTCUSDT',side:'LONG',opened_time:'1000',closed_time:'2000'};
 const rows=deduplicateV6EntryRows([{...base,update_time:'100',v:1},{...base,update_time:'200',v:2},{...base,closed_time:'3000',update_time:'300',v:3}]);
 assert.equal(rows.length,2);assert.equal(rows[0].v,2);
});
test('classifies dip versus momentum',()=>{assert.equal(classifyV6Entry('LONG',95,100),'dip');assert.equal(classifyV6Entry('SHORT',95,100),'momentum')});
test('paper dip reversal accounts for round-trip costs and stops',()=>{
 const x=simulateDipReversal([{time:0,close:100},{time:60000,close:99},{time:120000,close:100},{time:180000,close:100.5},{time:240000,close:101},{time:300000,close:102}],{lookback:2,threshold:0.005,stopLoss:0.01,takeProfit:0.02,maxBars:3,feeRate:0.0006,slippageRate:0.0003});
 assert.equal(x.trades.length,1);assert.ok(x.trades[0].netReturn<x.trades[0].grossReturn);assert.equal(x.trades[0].reason,'time');
});
