import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateConsensus,evaluateExperimentalConsensus,type SignalSnapshot} from '../src/ai-consensus-filter.js';
const sample:SignalSnapshot={strategy:'sol-long',symbol:'SOLUSDT',side:'LONG',signalTimeMs:2000,latestCandleCloseMs:1900,confidence:0.8,volatilityPct:1,spreadPct:0.03};
test('experiment disabled by default and never modifies control signals',()=>{
 assert.equal(evaluateExperimentalConsensus(sample,false),null);
 assert.equal(evaluateExperimentalConsensus(sample,true)?.decision,'allow');
 assert.equal(sample.confidence,0.8);
});
test('rejects future market information',()=>assert.equal(evaluateConsensus({...sample,latestCandleCloseMs:2001}).reason,'invalid-or-future-market-data'));
test('rejects bad and costly conditions',()=>{
 assert.equal(evaluateConsensus({...sample,confidence:0.3}).decision,'skip');
 assert.equal(evaluateConsensus({...sample,spreadPct:0.2}).reason,'spread-too-wide');
 assert.equal(evaluateConsensus({...sample,volatilityPct:6}).reason,'volatility-too-high');
});
test('deterministic, no network and no orders',()=>assert.deepEqual(evaluateConsensus(sample),evaluateConsensus(sample)));
