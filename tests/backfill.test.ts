import test from 'node:test';
import assert from 'node:assert/strict';
import {MINUTE,missingRanges,parseBybitHistory} from '../src/backfill.js';
const t=1735689600000;
test('detects consecutive missing minutes and splits batches',()=>{
 assert.deepEqual(missingRanges([t,t+4*MINUTE],t,t+4*MINUTE,2),[
  {start:t+MINUTE,end:t+2*MINUTE},
  {start:t+3*MINUTE,end:t+3*MINUTE}
 ]);
});
test('no missing minutes for complete series',()=>assert.deepEqual(missingRanges([t,t+MINUTE],t,t+MINUTE),[]));
test('accepts Bybit history as precise numeric strings',()=>{
 const x=parseBybitHistory({retCode:0,result:{symbol:'BTCUSDT',list:[[String(t),'100.1','102','98','101','12','1234']]}},'BTCUSDT',t,t);
 assert.equal(x[0].confirmed,true);assert.equal(x[0].close,'101');
});
test('rejects out of range history',()=>assert.throws(()=>parseBybitHistory({retCode:0,result:{symbol:'BTCUSDT',list:[[String(t+MINUTE),'1','1','1','1','1','1']]}},'BTCUSDT',t,t)));
test('rejects REST error',()=>assert.throws(()=>parseBybitHistory({retCode:10001,retMsg:'invalid'},'BTCUSDT',t,t)));
