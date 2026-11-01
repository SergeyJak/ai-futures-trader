import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleSolOpportunities,evaluateSolOpportunities,isVolumeTrendCandidate,SOL_VOLUME_TREND_RULES} from '../src/sol-entry-opportunity-study.js';
import type {Bar} from '../src/sol-recovery-breakout.js';
const flat=(n=1000):Bar[]=>Array.from({length:n},(_,i)=>({time:i*60000,open:100,high:100.1,low:99.9,close:100,volume:10}));
test('fixed-grid entries charge costs even when price does not move',()=>{
 const rows=sampleSolOpportunities(flat());
 assert.ok(rows.length>=5);assert.ok(rows.every(x=>x.netPct<0));
 assert.equal(new Set(rows.map(x=>x.entryAt)).size,rows.length);
});
test('stop-first assumption holds if stop and take hit same candle',()=>{
 const b=flat(400);b[121]={...b[121],high:103,low:98};
 const rows=sampleSolOpportunities(b);assert.equal(rows[0].reason,'STOP');assert.ok(rows[0].netPct<0);
});
test('candle gap excludes affected opportunity',()=>{
 const b=flat(400);b[140].time+=1000;
 const rows=sampleSolOpportunities(b);assert.equal(rows.some(x=>x.entryAt===121*60000),false);
});
test('winner/loser mining never reads validation or holdout into discovery',()=>{
 const r=evaluateSolOpportunities(flat());
 assert.equal(r.splits.length,3);assert.equal(r.splits[0].split,'discovery');
 assert.equal(r.splits[1].split,'validation');assert.equal(r.splits[2].split,'holdout');
 assert.equal(r.realOrders,false);
});

test('frozen candidate depends only on pre-entry features',()=>{
 const row=sampleSolOpportunities(flat())[0];
 const good={...row,trend30Pct:.1,volumeRatio5:1.6,drawdown30Pct:.3};
 assert.equal(isVolumeTrendCandidate(good),true);
 assert.equal(isVolumeTrendCandidate({...good,volumeRatio5:1}),false);
 assert.equal(isVolumeTrendCandidate({...good,trend30Pct:-.1}),false);
 assert.equal(SOL_VOLUME_TREND_RULES.minVolumeRatio5,1.35);
});
test('candidate holdout is evaluated independently of discovery',()=>{
 const r=evaluateSolOpportunities(flat());
 assert.equal(r.candidateDecision,'INSUFFICIENT_HOLDOUT');
 assert.equal(r.splits[2].candidate.trades,0);
 assert.ok(r.splits[0].trades>r.splits[2].trades);
});
