import test from 'node:test';
import assert from 'node:assert/strict';
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
