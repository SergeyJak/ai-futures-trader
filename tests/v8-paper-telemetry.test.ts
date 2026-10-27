import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeV8PaperTelemetry} from '../src/v8-paper-telemetry.js';
import {v8PageHtml} from '../src/v8-page.js';

const now=new Date('2026-10-27T00:30:00.000Z');
test('V8 telemetry distinguishes empty sample from measured zero and reports gap audits',()=>{
 const variants=[
  {id:'SOLUSDT-5m',symbol:'SOLUSDT',timeframe:5,closedTrades:0,netPnl:0,wins:0,balance:100,last_bar:'2026-10-27T00:29:00Z',position:null,pending:null,gapAudits:2},
  {id:'SOLUSDT-15m',symbol:'SOLUSDT',timeframe:15,closedTrades:2,netPnl:0,wins:1,balance:100,last_bar:'2026-10-27T00:29:00Z',position:{side:'LONG'},pending:null,gapAudits:0}
 ];
 const result=summarizeV8PaperTelemetry({variants},now);
 assert.equal(result.realOrders,false);
 assert.equal(result.variants[0].netPnl,null);
 assert.equal(result.variants[0].winRate,null);
 assert.equal(result.variants[0].gapAudits,2);
 assert.equal(result.variants[0].stale,false);
 assert.equal(result.variants[1].netPnl,0);
 assert.equal(result.variants[1].winRate,.5);
 assert.equal(result.variants[1].active,true);
 assert.equal(result.variants[1].insufficientSample,true);
 assert.deepEqual(result.variants[0].qualityIssues,[]);
});

test('V8 telemetry rejects inconsistent PnL and future or malformed bars',()=>{
 const variants=[
  {id:'bad',symbol:'BTCUSDT',timeframe:5,closedTrades:0,netPnl:1,wins:1,balance:100,last_bar:'2026-10-27T00:31:00Z',gapAudits:-1},
  {id:'bad-clock',symbol:'ETHUSDT',timeframe:15,closedTrades:3,netPnl:Infinity,wins:1,balance:100,last_bar:'not-a-date',gapAudits:0}
 ];
 const result=summarizeV8PaperTelemetry({variants},now);
 assert.deepEqual(result.variants[0].qualityIssues,['invalid_wins','invalid_gap_count','future_bar','pnl_without_trades']);
 assert.equal(result.variants[0].netPnl,null);
 assert.equal(result.variants[0].stale,true);
 assert.deepEqual(result.variants[1].qualityIssues,['invalid_pnl','invalid_bar_time']);
 assert.equal(result.variants[1].netPnl,null);
 assert.equal(result.variants[1].stale,true);
});

test('V8 UI shows no-data rather than fabricated zero and surfaces audited gaps',()=>{
 assert.match(v8PageHtml,/v\.closedTrades>0/);
 assert.match(v8PageHtml,/Нет закрытых сделок/);
 assert.match(v8PageHtml,/gapAudits/);
 assert.match(v8PageHtml,/Недостаточная новая выборка/);
});
