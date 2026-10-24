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
