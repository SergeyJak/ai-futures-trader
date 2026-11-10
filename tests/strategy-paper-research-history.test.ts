import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {strategyPaperResearchHistory,STRATEGY_RESEARCH_HISTORY_LIMIT} from '../src/strategy-paper.js';

test('research history is complete past the UI cap and excludes legacy, other variants and strategies',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const client=await pool.connect();
 try{
  // Session-local table; never modify real paper history.
  await client.query(`CREATE TEMP TABLE v6_paper_trades(
   id BIGSERIAL PRIMARY KEY,strategy TEXT,variant TEXT,side TEXT,entry_at TIMESTAMPTZ,
   exit_at TIMESTAMPTZ,entry_price DOUBLE PRECISION,exit_price DOUBLE PRECISION,
   net_pnl DOUBLE PRECISION,reason TEXT,execution_model TEXT)`);
  const insert=async(strategy:string,variant:string,model:string,n:number)=>client.query(
   `INSERT INTO v6_paper_trades(strategy,variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason,execution_model)
    SELECT $1,$2,'SHORT',TIMESTAMPTZ '2026-10-30 00:00:00+00'+g*INTERVAL '1 minute',
    TIMESTAMPTZ '2026-10-30 00:00:00+00'+(g+1)*INTERVAL '1 minute',100,99,0.1,'TIME',$3
    FROM generate_series(1,$4::int) g`,[strategy,variant,model,n]);
  await insert('dip_continuation','12h','legacy-close-v1',40);
  await insert('dip_continuation','12h','next-open-v2',180);
  await insert('dip_continuation','4h','next-open-v2',20);
  await insert('dip_reversal','12h','next-open-v2',10);
  const reader=client as unknown as pg.Pool;
  const report=await strategyPaperResearchHistory(reader,'dip_continuation');
  assert.equal(report.realOrders,false);
  assert.equal(report.mode,'forward-paper-research-history');
  assert.equal(report.total,180);
  assert.equal(report.trades.length,180);
  assert.equal(report.possiblyTruncated,false);
  assert.equal(Number(report.trades[0].id),41);
  assert.equal(Number(report.trades.at(-1)!.id),220);
  assert.ok(report.trades.every(t=>t.variant==='12h'&&t.execution_model==='next-open-v2'&&!('total_count' in t)));
  const empty=await strategyPaperResearchHistory(reader,'momentum_continuation');
  assert.equal(empty.total,0);assert.deepEqual(empty.trades,[]);
  await insert('dip_continuation','12h','next-open-v2',STRATEGY_RESEARCH_HISTORY_LIMIT);
  const capped=await strategyPaperResearchHistory(reader,'dip_continuation');
  assert.equal(capped.total,STRATEGY_RESEARCH_HISTORY_LIMIT+180);
  assert.equal(capped.trades.length,STRATEGY_RESEARCH_HISTORY_LIMIT);
  assert.equal(capped.possiblyTruncated,true);
 }finally{client.release();await pool.end()}
});
