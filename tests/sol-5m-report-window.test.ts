import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {sol5mReport,SOL_5M_VARIANTS} from '../src/sol-5m-paper.js';

test('SOL 5m report samples 90 trades per variant instead of 90 globally',async()=>{
 const queries:string[]=[];
 const accounts=SOL_5M_VARIANTS.map(v=>({id:v.id,balance:100,position:null,last_bar:null}));
 const trades=SOL_5M_VARIANTS.flatMap((v,i)=>Array.from({length:90},(_,j)=>({
  id:i*90+j+1,variant:v.id,entry_at:new Date(0),exit_at:new Date(60000),
  entry_price:100,exit_price:101,net_pnl:0.01,reason:'TIME'
 })));
 const totals=SOL_5M_VARIANTS.map(v=>({variant:v.id,closed:90,net:0.9,wins:90,max_drawdown_closed:0.025}));
 const pool={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.includes('sol_5m_accounts'))return {rows:accounts};
  if(sql.includes('COUNT(*)'))return {rows:totals};
  if(sql.includes('sol_5m_trades'))return {rows:trades};
  throw Error('unexpected SQL');
 }} as unknown as pg.Pool;
 const report=await sol5mReport(pool);
 assert.match(queries[1],/ROW_NUMBER\(\) OVER \(PARTITION BY variant ORDER BY id DESC\)/);
 assert.match(queries[1],/variant_rank<=90/);
 assert.doesNotMatch(queries[1],/ORDER BY id DESC LIMIT 90/);
 assert.match(queries[2],/SUM\(net_pnl\) OVER \(PARTITION BY variant ORDER BY id/);
 assert.match(queries[2],/GREATEST\(100,MAX\(balance\) OVER/);
 assert.match(queries[2],/MAX\(\(peak-balance\)\/peak\)/);
 assert.equal(report.variants.length,6);
 for(const variant of report.variants){
  assert.equal(variant.trades.length,90);
  assert.ok(variant.trades.every(t=>t.variant===variant.id));
  assert.equal(variant.closedTrades,90);
  assert.equal(variant.maxDrawdownClosed,0.025);
 }
 assert.equal(report.realOrders,false);
});
