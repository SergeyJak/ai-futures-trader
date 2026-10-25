import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeStrategyPaperTelemetry} from '../src/strategy-paper-telemetry.js';
import {EXPERIMENT_KEYS} from '../src/strategy-paper.js';

test('paper telemetry separates corrected from legacy and reports sample/freshness honestly',()=>{
 const now=new Date('2026-10-24T05:30:00.000Z');
 const report={realOrders:false,funding:'unknown',variants:[
  {id:'4h',position:{entry:101,entryAt:1},last_bar:'2026-10-24T05:29:00.000Z',closedTrades:80,realizedNetPnl:12,postFixClosedTrades:25,postFixRealizedNetPnl:-3,postFixWins:5,postFixMaxDrawdownClosed:.07},
  {id:'12h',position:{pendingAt:1},last_bar:null,closedTrades:30,realizedNetPnl:10,postFixClosedTrades:0,postFixRealizedNetPnl:0,postFixWins:0,postFixMaxDrawdownClosed:0}
 ]};
 const reports=Object.fromEntries(EXPERIMENT_KEYS.map(key=>[key,report])) as Parameters<typeof summarizeStrategyPaperTelemetry>[0];
 const result=summarizeStrategyPaperTelemetry(reports,now);
 assert.equal(result.realOrders,false);
 assert.equal(result.strategies.length,3);
 const corrected=result.strategies[0].variants[0];
 assert.equal(corrected.legacyClosed,55);
 assert.equal(corrected.postFixClosed,25);
 assert.equal(corrected.postFixNetPnl,-3);
 assert.equal(corrected.postFixMaxDrawdownClosed,.07);
 assert.equal(corrected.postFixWinRate,.2);
 assert.equal(corrected.insufficientSample,true);
 assert.equal(corrected.lastBarLagMinutes,1);
 assert.equal(corrected.stale,false);
 assert.equal(corrected.active,true);
 const pending=result.strategies[0].variants[1];
 assert.equal(pending.postFixWinRate,null);
 assert.equal(pending.stale,true);
 assert.equal(pending.active,false);
});

test('paper telemetry rejects future bars and inconsistent corrected trade evidence',()=>{
 const now=new Date('2026-10-24T05:30:00.000Z');
 const bad={realOrders:false,funding:'excluded',variants:[{
  id:'4h',position:null,last_bar:'2026-10-24T05:31:00.000Z',closedTrades:3,realizedNetPnl:1,
  postFixClosedTrades:4,postFixRealizedNetPnl:Infinity,postFixWins:5,postFixMaxDrawdownClosed:1.2
 }]};
 const reports=Object.fromEntries(EXPERIMENT_KEYS.map(key=>[key,bad])) as Parameters<typeof summarizeStrategyPaperTelemetry>[0];
 const variant=summarizeStrategyPaperTelemetry(reports,now).strategies[0].variants[0];
 assert.equal(variant.stale,true);
 assert.equal(variant.lastBarLagMinutes,null);
 assert.equal(variant.postFixMetricsValid,false);
 assert.deepEqual(variant.qualityIssues,['invalid_postfix_count','invalid_postfix_wins','invalid_pnl','invalid_drawdown','future_bar']);
});
test('paper telemetry accepts valid corrected evidence without declaring profitability',()=>{
 const now=new Date('2026-10-24T05:30:00.000Z');
 const report={realOrders:false,funding:'excluded',variants:[{
  id:'4h',position:null,last_bar:'2026-10-24T05:28:00.000Z',closedTrades:40,realizedNetPnl:-1,
  postFixClosedTrades:30,postFixRealizedNetPnl:-0.4,postFixWins:12,postFixMaxDrawdownClosed:.02
 }]};
 const reports=Object.fromEntries(EXPERIMENT_KEYS.map(key=>[key,report])) as Parameters<typeof summarizeStrategyPaperTelemetry>[0];
 const variant=summarizeStrategyPaperTelemetry(reports,now).strategies[0].variants[0];
 assert.equal(variant.stale,false);
 assert.equal(variant.postFixMetricsValid,true);
 assert.deepEqual(variant.qualityIssues,[]);
 assert.equal(variant.insufficientSample,false);
});

test('paper telemetry distinguishes no corrected trades from an observed zero return',()=>{
 const now=new Date('2026-10-26T00:00:00.000Z');
 const report={realOrders:false,funding:'excluded',variants:[
  {id:'empty',position:null,last_bar:'2026-10-25T23:59:00.000Z',closedTrades:10,realizedNetPnl:2,postFixClosedTrades:0,postFixRealizedNetPnl:0,postFixWins:0,postFixMaxDrawdownClosed:0},
  {id:'zero-return',position:null,last_bar:'2026-10-25T23:59:00.000Z',closedTrades:10,realizedNetPnl:2,postFixClosedTrades:1,postFixRealizedNetPnl:0,postFixWins:0,postFixMaxDrawdownClosed:0},
  {id:'contradictory',position:null,last_bar:'2026-10-25T23:59:00.000Z',closedTrades:10,realizedNetPnl:2,postFixClosedTrades:0,postFixRealizedNetPnl:3,postFixWins:0,postFixMaxDrawdownClosed:.1},
  {id:'invalid-financials',position:null,last_bar:'2026-10-25T23:59:00.000Z',closedTrades:10,realizedNetPnl:2,postFixClosedTrades:2,postFixRealizedNetPnl:Infinity,postFixWins:3,postFixMaxDrawdownClosed:-.1}
 ]};
 const reports=Object.fromEntries(EXPERIMENT_KEYS.map(key=>[key,report])) as Parameters<typeof summarizeStrategyPaperTelemetry>[0];
 const variants=summarizeStrategyPaperTelemetry(reports,now).strategies[0].variants;
 assert.equal(variants[0].postFixNetPnl,null);
 assert.equal(variants[0].postFixMaxDrawdownClosed,null);
 assert.equal(variants[0].postFixWinRate,null);
 assert.equal(variants[0].postFixMetricsValid,true);
 assert.equal(variants[1].postFixNetPnl,0);
 assert.equal(variants[1].postFixMaxDrawdownClosed,0);
 assert.equal(variants[1].postFixWinRate,0);
 assert.deepEqual(variants[2].qualityIssues,['pnl_without_trades','drawdown_without_trades']);
 assert.equal(variants[2].postFixNetPnl,null);
 assert.equal(variants[2].postFixMaxDrawdownClosed,null);
 assert.equal(variants[2].postFixMetricsValid,false);
 assert.equal(variants[3].postFixNetPnl,null);
 assert.equal(variants[3].postFixMaxDrawdownClosed,null);
 assert.equal(variants[3].postFixWinRate,null);
 assert.equal(variants[3].postFixMetricsValid,false);
});
