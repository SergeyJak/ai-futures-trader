import test from 'node:test';
import assert from 'node:assert/strict';
import {chronologicalHoldout,type CompletedTrade} from '../src/v6-oos-backtest.js';
const day=86400000;
const row=(i:number,pattern:CompletedTrade['pattern']):CompletedTrade=>({id:String(i),openedMs:i*day,closedMs:i*day+3600000,pattern,side:'LONG',entry:100,exit:102});
test('a selected pattern without enough holdout examples is inconclusive',()=>{
 const rows=Array.from({length:100},(_,i)=>row(i,i<70?'dip_reversal':'momentum_continuation'));
 const result=chronologicalHoldout(rows);
 assert.equal(result.status,'insufficient_data');
 if(result.status==='insufficient_data')assert.match(result.reason,/fewer than five holdout/);
});
