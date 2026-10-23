import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {strategyPaperReport,EXIT_MODES} from '../src/strategy-paper.js';

test('paper evidence query limits each variant independently, not all variants together',async()=>{
 const queries:string[]=[];
 const accounts=EXIT_MODES.map(v=>({variant:v.id,balance:100,position:null,last_bar:null}));
 const trades=EXIT_MODES.flatMap((v,i)=>Array.from({length:150},(_,j)=>({
  id:i*150+j+1,variant:v.id,side:'LONG',entry_at:new Date(0),
  exit_at:new Date(60000),entry_price:100,exit_price:101,net_pnl:0.01,reason:'TIME'
 })));
 const pool={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('v6_paper_accounts'))return {rows:accounts};
  if(sql.includes('WITH equity AS'))return {rows:EXIT_MODES.map(v=>({variant:v.id,closed:170,net:1.7,wins:100,max_drawdown_closed:0.035}))};
  if(sql.includes('v6_paper_trades'))return {rows:trades};
  throw Error('unexpected query');
 }} as unknown as pg.Pool;
 const report=await strategyPaperReport(pool,'dip_reversal');
 assert.match(queries[1],/ROW_NUMBER\(\) OVER \(PARTITION BY variant ORDER BY id DESC\)/);
 assert.match(queries[1],/variant_rank<=150/);
 assert.doesNotMatch(queries[1],/ORDER BY id DESC LIMIT 150/);
 assert.equal(queries.length,3);
 assert.match(queries[2],/FROM v6_paper_trades WHERE strategy=\\$1/);
 assert.match(queries[2],/PARTITION BY variant ORDER BY id/);
 assert.doesNotMatch(queries[2],/variant_rank<=150/);
 assert.equal(report.variants.length,4);
 for(const variant of report.variants){
  assert.equal(variant.trades.length,150);
  assert.equal(variant.closedTrades,170);
  assert.equal(variant.realizedNetPnl,1.7);
  assert.equal(variant.wins,100);
  assert.equal(variant.maxDrawdownClosed,0.035);
  assert.ok(variant.trades.every(t=>t.variant===variant.id));
 }
 assert.equal(report.realOrders,false);
});
