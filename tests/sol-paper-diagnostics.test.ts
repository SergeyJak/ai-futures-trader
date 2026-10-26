import test from 'node:test';
import assert from 'node:assert/strict';
import {solPaperDiagnostics} from '../src/sol-paper-diagnostics.js';

test('SOL paper diagnostics preserve side, durations, net PnL and bounded samples',()=>{
 const trade={id:1,variant:'30m',entry_at:'2026-10-18T17:00:00.000Z',exit_at:'2026-10-18T17:30:00.000Z',entry_price:100,exit_price:101,net_pnl:0.07,reason:'TIME'};
 const long={feeRate:0.0006,slippageRate:0.0003,variants:[{id:'30m',position:null,closedTrades:4,realizedNetPnl:-0.1,postFixClosedTrades:2,postFixRealizedNetPnl:-0.05,postFixWins:1,trades:Array.from({length:8},(_,i)=>({...trade,id:i+1}))}]};
 const short={...long,variants:[{id:'30m',position:{entry:100,entryAt:Date.parse(trade.entry_at)},closedTrades:2,realizedNetPnl:0.2,trades:[]}]};
 const result=solPaperDiagnostics(long,short);
 assert.equal(result.realOrders,false);
 assert.equal(result.long.variants[0].lastTrades.length,3);
 assert.equal(result.long.variants[0].lastTrades[0].durationMinutes,30);
 assert.equal(result.long.variants[0].lastTrades[0].validClock,true);
 assert.equal(result.long.variants[0].netPnl,-0.1);
 assert.equal(result.long.variants[0].legacyClosed,2);
 assert.equal(result.long.variants[0].postFixClosed,2);
 assert.equal(result.long.variants[0].postFixNetPnl,-0.05);
 assert.equal(result.long.variants[0].postFixWins,1);
 assert.equal(result.long.variants[0].insufficientPostFixSample,true);
 assert.equal(result.short.variants[0].active,true);
 assert.equal(result.short.variants[0].netPnl,0.2);
});

test('SOL telemetry survives corrupt trade timestamps and flags unreliable evidence',()=>{
 const invalid={id:9,variant:'30m',entry_at:'bad timestamp',exit_at:'2026-10-24T05:30:00.000Z',entry_price:100,exit_price:101,net_pnl:0.1,reason:'TIME'};
 const report={feeRate:.0006,slippageRate:.0003,variants:[{id:'30m',position:null,closedTrades:1,realizedNetPnl:.1,trades:[invalid]}]};
 const result=solPaperDiagnostics(report,report);
 const trade=result.long.variants[0].lastTrades[0];
 assert.equal(trade.entryAt,null);
 assert.equal(trade.durationMinutes,null);
 assert.equal(trade.validClock,false);
 assert.equal(trade.validEvidence,false);
});

test('SOL telemetry distinguishes no corrected sample from an observed zero return',()=>{
 const empty={id:'4h',position:null,closedTrades:2,realizedNetPnl:0.12,postFixClosedTrades:0,postFixRealizedNetPnl:0,postFixWins:0,trades:[]};
 const observedZero={...empty,id:'30m',postFixClosedTrades:1,postFixRealizedNetPnl:0};
 const report={feeRate:.0006,slippageRate:.0003,variants:[empty,observedZero]};
 const variants=solPaperDiagnostics(report,report).long.variants;
 assert.equal(variants[0].postFixNetPnl,null);
 assert.equal(variants[0].postFixWinRate,null);
 assert.equal(variants[0].postFixMetricsValid,true);
 assert.equal(variants[1].postFixNetPnl,0);
 assert.equal(variants[1].postFixWinRate,0);
 assert.equal(variants[1].postFixMetricsValid,true);
});

test('SOL telemetry rejects contradictory and nonfinite paper financial evidence',()=>{
 const base={id:'4h',position:null,closedTrades:3,realizedNetPnl:0.3,postFixClosedTrades:0,postFixRealizedNetPnl:0,postFixWins:0,trades:[]};
 const report={feeRate:.0006,slippageRate:.0003,variants:[
  {...base,id:'empty-lifetime',closedTrades:0,realizedNetPnl:0},
  {...base,id:'contradictory',postFixRealizedNetPnl:0.5},
  {...base,id:'invalid',postFixClosedTrades:2,postFixRealizedNetPnl:Infinity,postFixWins:3},
  {...base,id:'invalid-count',postFixClosedTrades:4,postFixRealizedNetPnl:1,postFixWins:1},
  {...base,id:'lifetime-contradiction',closedTrades:0,realizedNetPnl:1}
 ]};
 const variants=solPaperDiagnostics(report,report).long.variants;
 assert.equal(variants[0].netPnl,null);
 assert.equal(variants[0].postFixNetPnl,null);
 assert.equal(variants[1].postFixNetPnl,null);
 assert.deepEqual(variants[1].qualityIssues,['postfix_pnl_without_trades']);
 assert.equal(variants[2].postFixNetPnl,null);
 assert.equal(variants[2].postFixWinRate,null);
 assert.deepEqual(variants[2].qualityIssues,['invalid_postfix_wins','invalid_pnl']);
 assert.equal(variants[3].postFixNetPnl,null);
 assert.equal(variants[3].legacyClosed,null);
 assert.equal(variants[3].postFixMetricsValid,false);
 assert.equal(variants[4].netPnl,null);
 assert.deepEqual(variants[4].qualityIssues,['lifetime_pnl_without_trades']);
});

test('SOL pending next-open signal is not an active position',()=>{
 const report={feeRate:.0006,slippageRate:.0003,variants:[{
  id:'4h',position:{entry:0,entryAt:0,pendingAt:Date.parse('2026-10-26T01:00:00Z')},
  closedTrades:0,realizedNetPnl:0,postFixClosedTrades:0,postFixRealizedNetPnl:0,postFixWins:0,trades:[]
 }]};
 const variant=solPaperDiagnostics(report,report).long.variants[0];
 assert.equal(variant.active,false);
 assert.equal(variant.postFixNetPnl,null);
});
