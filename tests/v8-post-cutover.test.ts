import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {v8PaperReport,V8_EVIDENCE_CUTOVER} from '../src/v8-paper.js';
import {summarizeV8PaperTelemetry} from '../src/v8-paper-telemetry.js';
import {v8PageHtml} from '../src/v8-page.js';

test('V8 separates post-fix entries and exits without mutating the historical ledger',async()=>{
 const queries:{sql:string;params:unknown[]|undefined}[]=[];
 const pool={query:async(sql:string,params?:unknown[])=>{
  queries.push({sql,params});
  if(sql.includes('FROM v8_paper_accounts'))return {rows:[{id:'SOLUSDT-5m',balance:98,position:null,pending:null,last_bar:new Date('2026-10-27T04:00:00Z')}]};
  if(sql.includes('FROM v8_paper_trades ORDER BY id'))return {rows:[]};
  if(sql.includes('WITH eligible AS'))return {rows:[{variant:'SOLUSDT-5m',closed:2,net:-0.1,wins:1,max_drawdown:0.001}]};
  if(sql.includes('GROUP BY variant')&&sql.includes('v8_paper_trades'))return {rows:[{variant:'SOLUSDT-5m',closed:92,net:-1.55,wins:25}]};
  return {rows:[]};
 }};
 const result=await v8PaperReport(pool as never);
 const sol=result.variants.find(v=>v.id==='SOLUSDT-5m')!;
 assert.equal(sol.closedTrades,92);
 assert.equal(sol.netPnl,-1.55);
 assert.equal(sol.postCutoverClosedTrades,2);
 assert.equal(sol.postCutoverNetPnl,-0.1);
 assert.equal(sol.postCutoverMaxDrawdownClosed,0.001);
 assert.equal(result.cutoverAt,V8_EVIDENCE_CUTOVER);
 assert.equal(queries.length,5);
 const q=queries.find(x=>x.sql.includes('WITH eligible AS'))!;
 assert.deepEqual(q.params,[V8_EVIDENCE_CUTOVER]);
 assert.match(q.sql,/entry_at >= \$1::timestamptz AND exit_at >= \$1::timestamptz/);
 assert.match(q.sql,/ORDER BY exit_at,id/);
 assert.equal(queries.filter(x=>/UPDATE|DELETE|INSERT/.test(x.sql)).length,0);
});

test('V8 telemetry withholds cutover PnL until there are corrected closes',()=>{
 const base={id:'SOLUSDT-5m',symbol:'SOLUSDT',timeframe:5,closedTrades:92,netPnl:-1.55,wins:25,balance:98,last_bar:'2026-10-27T03:59:00Z',gapAudits:1};
 const now=new Date('2026-10-27T04:00:00Z');
 const empty=summarizeV8PaperTelemetry({variants:[{...base,postCutoverClosedTrades:0,postCutoverNetPnl:0,postCutoverWins:0,postCutoverMaxDrawdownClosed:0}]},now).variants[0];
 assert.equal(empty.postCutoverNetPnl,null);
 assert.equal(empty.postCutoverMaxDrawdownClosed,null);
 assert.equal(empty.postCutoverInsufficientSample,true);
 const measured=summarizeV8PaperTelemetry({variants:[{...base,postCutoverClosedTrades:2,postCutoverNetPnl:-0.1,postCutoverWins:1,postCutoverMaxDrawdownClosed:0.001}]},now).variants[0];
 assert.equal(measured.postCutoverNetPnl,-0.1);
 assert.equal(measured.postCutoverWinRate,0.5);
 assert.equal(measured.postCutoverMaxDrawdownClosed,0.001);
 assert.deepEqual(measured.qualityIssues,[]);
});

test('V8 UI separates corrected and legacy paper PnL',()=>{
 assert.match(v8PageHtml,/postCutoverClosedTrades/);
 assert.match(v8PageHtml,/postCutoverMaxDrawdownClosed/);
 assert.match(v8PageHtml,/Вся история/);
 assert.match(v8PageHtml,/Недостаточная новая выборка/);
});

test('PostgreSQL computes post-cutover closed drawdown and excludes cross-boundary trades',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const client=await pool.connect();
 try{
  await client.query('CREATE TEMP TABLE v8_paper_accounts(id text,balance float8,position jsonb,pending jsonb,last_bar timestamptz)');
  await client.query('CREATE TEMP TABLE v8_paper_trades(id bigserial,variant text,side text,entry_at timestamptz,exit_at timestamptz,entry_price float8,exit_price float8,net_pnl float8,reason text)');
  await client.query('CREATE TEMP TABLE v8_paper_gap_audit(variant text)');
  await client.query("INSERT INTO v8_paper_accounts VALUES('SOLUSDT-5m',99.5,NULL,NULL,'2026-10-27T04:00:00Z')");
  const rows=[
   ['2026-10-26T20:00:00Z','2026-10-26T20:30:00Z',-0.2],
   ['2026-10-27T00:39:00Z','2026-10-27T00:42:00Z',0.5],
   ['2026-10-27T01:00:00Z','2026-10-27T01:10:00Z',-1],
   ['2026-10-27T02:00:00Z','2026-10-27T02:10:00Z',0.5]
  ] as const;
  for(const [entry,exit,pnl] of rows)await client.query(
   "INSERT INTO v8_paper_trades(variant,side,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES('SOLUSDT-5m','LONG',$1,$2,100,100,$3,'TIME')",
   [entry,exit,pnl]);
  const adapter={query:(...args:Parameters<typeof client.query>)=>(client.query as Function)(...args)} as unknown as pg.Pool;
  const report=await v8PaperReport(adapter);
  const sol=report.variants.find(v=>v.id==='SOLUSDT-5m')!;
  assert.equal(sol.closedTrades,4);
  assert.equal(sol.postCutoverClosedTrades,2);
  assert.equal(sol.postCutoverWins,1);
  assert.equal(sol.postCutoverNetPnl,-0.5);
  assert.ok(Math.abs(sol.postCutoverMaxDrawdownClosed-0.01)<1e-10);
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM v8_paper_trades')).rows[0].n,4);
 }finally{client.release();await pool.end()}
});
