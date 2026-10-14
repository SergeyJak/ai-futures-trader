import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedForwardAssessment,FIXED_V6_CUTOFF,type ObservedTrade} from '../src/v6-fixed-forward.js';
const day=86400000;
const make=(i:number,pattern:ObservedTrade['pattern'],after=false):ObservedTrade=>{
 const openedMs=FIXED_V6_CUTOFF+(after?i*day:(i-70)*day);
 return {id:String(i),openedMs,closedMs:openedMs+3600000,observedAtMs:openedMs+7200000,side:'LONG',entry:100,exit:pattern==='dip_reversal'?102:101,pattern};
};
test('does not evaluate before fixed cutoff',()=>{
 assert.equal(fixedForwardAssessment([],FIXED_V6_CUTOFF-1).status,'awaiting_cutoff');
});
test('test-period losses cannot select a training pattern',()=>{
 const train=Array.from({length:70},(_,i)=>make(i,i%2===0?'dip_reversal':'momentum_continuation'));
 const forward=Array.from({length:30},(_,i)=>({...make(70+i,i%2===0?'dip_reversal':'momentum_continuation',true),exit:i%2===0?90:110}));
 const result=fixedForwardAssessment([...train,...forward],FIXED_V6_CUTOFF+100*day);
 assert.equal(result.status,'evaluated');
 if(result.status==='evaluated'){
  assert.equal(result.selectedPattern,'dip_reversal');
  assert.ok((result.forward.meanNetReturn??0)<0);
 }
});
test('late backfilled pre-cutoff observations cannot alter training selection',()=>{
 const train=Array.from({length:70},(_,i)=>make(i,i%2===0?'dip_reversal':'momentum_continuation'));
 const late={...make(100,'momentum_continuation'),openedMs:FIXED_V6_CUTOFF-2*day,closedMs:FIXED_V6_CUTOFF-day,observedAtMs:FIXED_V6_CUTOFF+day,exit:200};
 const result=fixedForwardAssessment([...train,late],FIXED_V6_CUTOFF+10*day);
 assert.equal(result.status,'insufficient_data');
 if(result.status==='insufficient_data')assert.equal(result.selectedPattern,'dip_reversal');
});
test('no premature result for undersized selected-pattern holdout',()=>{
 const train=Array.from({length:70},(_,i)=>make(i,'dip_reversal'));
 const forward=Array.from({length:14},(_,i)=>make(70+i,'dip_reversal',true));
 const result=fixedForwardAssessment([...train,...forward],FIXED_V6_CUTOFF+100*day);
 assert.equal(result.status,'insufficient_data');
 if(result.status==='insufficient_data')assert.equal(result.selectedPatternTestCount,14);
});
