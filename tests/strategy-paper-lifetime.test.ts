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
  assert.equal(v.postFixMaxDrawdownClosed,0);
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
 assert.match(html,/v.maxDrawdownClosed/);
 assert.match(html,/v.postFixMaxDrawdownClosed/);
 assert.match(html,/validCorrected=Number\.isInteger\(correctedClosed\)&&correctedClosed>0/);
 assert.match(html,/sampled\?\(total>=0/);
 assert.match(html,/Нет данных/);
 assert.match(html,/lifetimeClosed>0&&Number\.isFinite\(lifetimeNet\)/);
 assert.match(html,/расхождение баланса и истории/);
 assert.match(html,/Четыре виртуальных счёта по 100 USDT/);
 assert.doesNotMatch(html,/Девять независимых виртуальных счетов/);
});

test('corrected-model drawdown uses its own lifetime equity curve, not legacy fills or last 150 trades',async()=>{
 let lifetimeQuery='';
 const pool={query:async(sql:string)=>{
  if(sql.includes('v6_paper_accounts'))return {rows:EXIT_MODES.map(v=>({variant:v.id,balance:100,position:null,last_bar:null}))};
  if(sql.includes('ROW_NUMBER() OVER (PARTITION BY variant ORDER BY id DESC)'))return {rows:[]};
  lifetimeQuery=sql;
  return {rows:[{variant:'4h',closed:200,net:-15,wins:50,post_fix_closed:35,post_fix_net:4,post_fix_wins:20,max_drawdown_closed:0.42,post_fix_max_drawdown_closed:0.06}]};
 }} as unknown as pg.Pool;
 const report=await strategyPaperReport(pool,'dip_reversal');
 const corrected=report.variants.find(v=>v.id==='4h')!;
 assert.equal(corrected.closedTrades,200);
 assert.equal(corrected.postFixClosedTrades,35);
 assert.equal(corrected.maxDrawdownClosed,0.42);
 assert.equal(corrected.postFixMaxDrawdownClosed,0.06);
 assert.equal(report.variants.find(v=>v.id==='12h')!.postFixMaxDrawdownClosed,0);
 // Full-history scan; corrected-only partition and running peak are independent of legacy equity.
 assert.match(lifetimeQuery,/post_fix_equity AS \([\s\S]*?WHERE strategy=\$1 AND execution_model='next-open-v2'/);
 assert.match(lifetimeQuery,/post_fix_peaks AS \([\s\S]*?PARTITION BY variant ORDER BY id/);
 assert.match(lifetimeQuery,/FROM lifetime LEFT JOIN post_fix_drawdown USING\(variant\)/);
 assert.doesNotMatch(lifetimeQuery,/LIMIT\s+150/i);
});
