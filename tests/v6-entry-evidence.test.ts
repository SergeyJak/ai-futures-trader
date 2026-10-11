import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyV6Entry,summarizeV6EntryEvidence} from '../src/v6-entry-study.js';

test('V6 separates observed dip entries from momentum without assuming profits',()=>{
 assert.equal(classifyV6Entry('LONG',98,100),'dip');
 assert.equal(classifyV6Entry('SHORT',102,100),'dip');
 assert.equal(classifyV6Entry('LONG',102,100),'momentum');
 assert.equal(classifyV6Entry('SHORT',98,100),'momentum');
 assert.equal(classifyV6Entry('LONG',100,100),'flat');
 assert.equal(classifyV6Entry('OPEN',98,100),'unknown');
});
test('V6 entry evidence reports non-random candle coverage and low sample size',()=>{
 const e=summarizeV6EntryEvidence([
  {count:50,covered:8,against:6,withTrend:2,flat:0,uncovered:42},
  {count:20,covered:4,against:3,withTrend:1,flat:0,uncovered:16}
 ]);
 assert.deepEqual([e.total,e.covered,e.uncovered,e.dip,e.momentum,e.flat],[70,12,58,9,3,0]);
 assert.equal(e.coverageRate,12/70);
 assert.equal(e.dipShareAmongCovered,.75);
 assert.equal(e.assessment,'insufficient_sample');
});
test('V6 entry evidence cannot promote heavily missing data to representative research',()=>{
 const e=summarizeV6EntryEvidence([{count:100,covered:35,against:20,withTrend:15,flat:0,uncovered:65}]);
 assert.equal(e.assessment,'selection_biased');
 assert.equal(e.coverageRate,.35);
});
test('V6 entry evidence remains descriptive even when coverage is high',()=>{
 const e=summarizeV6EntryEvidence([{count:40,covered:36,against:18,withTrend:18,flat:0,uncovered:4}]);
 assert.equal(e.assessment,'descriptive_only');
 assert.equal(e.dipShareAmongCovered,.5);
});
test('V6 empty entry sample never fabricates a ratio',()=>{
 const e=summarizeV6EntryEvidence([]);
 assert.equal(e.total,0);
 assert.equal(e.coverageRate,null);
 assert.equal(e.dipShareAmongCovered,null);
 assert.equal(e.assessment,'insufficient_sample');
});
