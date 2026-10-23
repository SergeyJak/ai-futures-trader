import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateConsensus} from '../src/ai-consensus-filter.js';
import {summarizeForwardCohort} from '../src/ai-consensus-ledger.js';
const snapshot={strategy:'sol-long',symbol:'SOLUSDT',side:'LONG' as const,signalTimeMs:2000,latestCandleCloseMs:1900,confidence:0.8,volatilityPct:1,spreadPct:0.02};
const accepted={id:'signal-1',snapshot,decision:evaluateConsensus(snapshot),observedAtMs:2000};
test('net paper PnL deducts costs without affecting control cohort',()=>{
 assert.deepEqual(summarizeForwardCohort([accepted],[{signalId:'signal-1',closedAtMs:3000,grossPnl:10,fees:2,slippage:1,funding:0.5}]),{signals:1,allowed:1,skipped:0,closed:1,netPnl:6.5,wins:1,losses:0});
});
test('rejects duplicate fills and lookahead',()=>{
 const fill={signalId:'signal-1',closedAtMs:3000,grossPnl:1,fees:0,slippage:0,funding:0};
 assert.throws(()=>summarizeForwardCohort([accepted],[fill,fill]),/duplicate-outcome/);
 assert.throws(()=>summarizeForwardCohort([{...accepted,observedAtMs:1999}],[]),/non-forward/);
});
test('skipped signals never produce experimental fills',()=>{
 const skipped={...accepted,decision:evaluateConsensus({...snapshot,confidence:0.1})};
 assert.throws(()=>summarizeForwardCohort([skipped],[{signalId:'signal-1',closedAtMs:3000,grossPnl:1,fees:0,slippage:0,funding:0}]),/unknown-or-skipped/);
});
test('rejects non-finite signal and observation clocks',()=>{
 for(const time of [NaN,Infinity,-Infinity]){
  assert.throws(()=>summarizeForwardCohort([{...accepted,observedAtMs:time}],[]),/non-forward/);
  assert.throws(()=>summarizeForwardCohort([{...accepted,snapshot:{...snapshot,latestCandleCloseMs:time}}],[]),/non-forward/);
 }
 assert.throws(()=>summarizeForwardCohort([{...accepted,snapshot:{...snapshot,signalTimeMs:0}}],[]),/non-forward/);
});
test('rejects outcome before observation even if after signal',()=>{
 const observedLater={...accepted,observedAtMs:2500};
 const fill={signalId:'signal-1',closedAtMs:2400,grossPnl:10,fees:1,slippage:0,funding:0};
 assert.throws(()=>summarizeForwardCohort([observedLater],[fill]),/outcome-before-observation/);
 assert.throws(()=>summarizeForwardCohort([accepted],[{...fill,closedAtMs:NaN}]),/outcome-before-observation/);
 assert.equal(summarizeForwardCohort([observedLater],[{...fill,closedAtMs:2500}]).netPnl,9);
});
