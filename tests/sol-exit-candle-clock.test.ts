import test from 'node:test';
import assert from 'node:assert/strict';
import {exitDecision,confirmedCandleCloseTime} from '../src/sol-dip-paper.js';
import {shortExitDecision} from '../src/sol-short-paper.js';

test('SOL time exits expire at confirmed candle close for LONG and SHORT',()=>{
 const entry={entry:100,entryAt:0};
 for(const decide of [exitDecision,shortExitDecision]){
  const bar={time:29*60000,high:100,low:100,close:100};
  assert.equal(decide(entry,{...bar,time:28*60000},30),null);
  assert.equal(decide(entry,bar,30)?.reason,'TIME');
  assert.equal(decide(entry,{...bar,time:239*60000},240)?.reason,'TIME');
  assert.equal(decide(entry,bar,null),null);
 }
 assert.equal(confirmedCandleCloseTime(29*60000),30*60000);
});
