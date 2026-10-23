import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePaperCohorts} from '../src/ai-consensus-comparison.js';
import {evaluateConsensus} from '../src/ai-consensus-filter.js';
const snapshot={strategy:'sol-long',symbol:'SOLUSDT',side:'LONG' as const,signalTimeMs:1000,latestCandleCloseMs:900,confidence:0.9,volatilityPct:1,spreadPct:0.01};
const signal={id:'one',snapshot,decision:evaluateConsensus(snapshot),observedAtMs:1000};
const fill={signalId:'one',closedAtMs:2000,grossPnl:5,fees:1,slippage:0.5,funding:0};
test('paper cohorts stay independent and show sample warning',()=>{
 const result=comparePaperCohorts({observations:[signal],outcomes:[fill]},{observations:[signal],outcomes:[]});
 assert.equal(result.mode,'PAPER_RESEARCH_ONLY');
 assert.equal(result.control.netPnl,3.5);
 assert.equal(result.filtered.netPnl,0);
 assert.equal(result.netPnlDelta,-3.5);
 assert.equal(result.sampleWarning,'insufficient-closed-trades');
});
