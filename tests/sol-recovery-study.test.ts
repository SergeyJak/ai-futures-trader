import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryBacktest,type Bar} from '../src/sol-recovery-breakout.js';
import {evaluateRecovery,summarizeRecovery} from '../src/sol-recovery-study.js';
const bars=():Bar[]=>Array.from({length:300},(_,i)=>({time:i*60000,open:100,high:100.1,low:99.9,close:100,volume:10}));
test('fixed-cost recovery signal enters next open and takes profit',()=>{
 const b=bars();
 b[80].high=103;
 for(let i=91;i<100;i++){b[i]={...b[i],open:98.5,high:99,low:98,close:98.5,volume:i>=96?1000:10}}
 b[100]={...b[100],open:98.5,high:100.5,low:98.5,close:100,volume:1000};
 b[101]={...b[101],open:100,high:102,low:100,close:101.5};
 const trades=recoveryBacktest(b);
 assert.equal(trades.length,1);assert.equal(trades[0].entryAt,101*60000);
 assert.equal(trades[0].reason,'TAKE');assert.ok(trades[0].netPct>0);
});
test('same-bar stop wins over take',()=>{
 const b=bars();b[80].high=103;
 for(let i=91;i<100;i++){b[i]={...b[i],open:98.5,high:99,low:98,close:98.5,volume:i>=96?1000:10}}
 b[100]={...b[100],open:98.5,high:100.5,low:98.5,close:100,volume:1000};
 b[101]={...b[101],open:100,high:103,low:98,close:101};
 const t=recoveryBacktest(b);assert.equal(t.length,1);assert.equal(t[0].reason,'STOP');assert.ok(t[0].netPct<0);
});
test('reports scale trade percent by 10 USDT notional, not 100',()=>{
 const r=summarizeRecovery([{entryAt:0,exitAt:1,netPct:1,reason:'TAKE'},{entryAt:2,exitAt:3,netPct:-2,reason:'STOP'}]);
 assert.equal(r.trades,2);assert.ok(Math.abs(r.netPnlUsdt+0.1)<1e-10);assert.ok(r.maxDrawdownPct>0);
});
test('chronological holdout stays untouched and reports insufficient evidence',()=>{
 const r=evaluateRecovery(bars());assert.deepEqual(r.results.map(x=>x.bars),[180,60,60]);assert.equal(r.holdoutDecision,'INSUFFICIENT_DATA');assert.equal(r.realOrders,false);
});
