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
