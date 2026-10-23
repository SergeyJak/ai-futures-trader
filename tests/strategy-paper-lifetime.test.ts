import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {strategyPaperReport,EXIT_MODES} from '../src/strategy-paper.js';
import {strategyPageHtml} from '../src/strategy-pages.js';

test('empty strategy paper history has zero lifetime metrics and no invented evidence',async()=>{
 const pool={query:async(sql:string,params?:unknown[])=>{
  assert.deepEqual(params,['momentum_continuation']);
  if(sql.includes('v6_paper_accounts'))return {rows:EXIT_MODES.map(v=>({variant:v.id,balance:100,position:null,last_bar:null}))};
  return {rows:[]};
 }} as unknown as pg.Pool;
 const report=await strategyPaperReport(pool,'momentum_continuation');
 for(const v of report.variants){
  assert.equal(v.closedTrades,0);
  assert.equal(v.realizedNetPnl,0);
  assert.equal(v.wins,0);
  assert.equal(v.maxDrawdownClosed,0);
  assert.equal(v.evidence.closed,0);
  assert.equal(v.evidence.minimumEvidenceMet,false);
 }
 assert.equal(report.realOrders,false);
 assert.match(report.warning,/funding/);
});

test('strategy UI exposes closed-trade sample, lifetime net and closed-equity drawdown',()=>{
 const html=strategyPageHtml('dip_continuation');
 assert.match(html,/v\.closedTrades/);
 assert.match(html,/v\.realizedNetPnl/);
 assert.match(html,/v\.maxDrawdownClosed/);
 assert.match(html,/расхождение баланса и истории/);
});
