import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMomentumBracket,momentumBracketResearch,MOMENTUM_BRACKET_CUTOFF} from '../src/momentum-bracket-research.js';
import type {MomentumTrade} from '../src/momentum-bracket-research.js';

function trade(id:number,variant:'bracket'|'24h',entry:string,exit:string,exitPrice:number,side='LONG'):MomentumTrade{
 return {id,variant,side,entry_at:entry,exit_at:exit,entry_price:100,exit_price:exitPrice};
}
function pair(i:number,start:number,candidatePrice=103,controlPrice=101):MomentumTrade[]{
 const entry=new Date(start).toISOString();
 return [
  trade(i*2+1,'bracket',entry,new Date(start+2*3600000).toISOString(),candidatePrice),
  trade(i*2+2,'24h',entry,new Date(start+24*3600000).toISOString(),controlPrice)
 ];
}
test('pre-registered prospective paired bracket comparison can pass only with independent positive evidence',()=>{
 const cutoff=Date.parse(MOMENTUM_BRACKET_CUTOFF);
 const rows=Array.from({length:31},(_,i)=>pair(i,cutoff+i*26*3600000)).flat();
 const result=evaluateMomentumBracket(rows);
 assert.equal(result.development.independentPairs,0);
 assert.equal(result.forwardHoldout.matchedPairs,31);
 assert.equal(result.forwardHoldout.independentPairs,31);
 assert.equal(result.forwardHoldout.candidate.trades,31);
 assert.ok(result.forwardHoldout.candidate.netPnlUsdt>0);
 assert.ok((result.forwardHoldout.approximate95PairedDifferenceCiUsdt?.[0]??0)>0);
 assert.equal(result.status,'positive_before_funding_unverified');
 assert.equal(result.realOrders,false);
 assert.equal(result.funding,'unverified; excluded');
});
test('overlapping candidate/control intervals do not inflate independent evidence',()=>{
 const cutoff=Date.parse(MOMENTUM_BRACKET_CUTOFF);
 const rows=Array.from({length:40},(_,i)=>pair(i,cutoff+i*60000)).flat();
 const result=evaluateMomentumBracket(rows);
 assert.equal(result.forwardHoldout.matchedPairs,40);
 assert.equal(result.forwardHoldout.independentPairs,1);
 assert.equal(result.status,'insufficient_forward_sample');
});
test('different entry times, duplicate variants, invalid prices and old trades are not prospective pairs',()=>{
 const cutoff=Date.parse(MOMENTUM_BRACKET_CUTOFF);
 const rows=[
  ...pair(1,cutoff-26*3600000),
  ...pair(2,cutoff),
  trade(99,'bracket',new Date(cutoff).toISOString(),new Date(cutoff+3600000).toISOString(),102),
  trade(100,'bracket',new Date(cutoff+1000).toISOString(),new Date(cutoff+3600000).toISOString(),102),
  trade(101,'24h',new Date(cutoff+2000).toISOString(),new Date(cutoff+24*3600000).toISOString(),101),
  trade(102,'bracket',new Date(cutoff+3000).toISOString(),new Date(cutoff+3600000).toISOString(),Infinity)
 ];
 const result=evaluateMomentumBracket(rows);
 assert.equal(result.development.independentPairs,1);
 assert.equal(result.forwardHoldout.independentPairs,0);
 assert.equal(result.quality.duplicates,1);
 assert.equal(result.quality.invalid,1);
 assert.equal(result.quality.unmatchedCandidate,1);
 assert.equal(result.quality.unmatchedControl,1);
 assert.equal(result.status,'insufficient_forward_sample');
});
test('loss-making bracket cannot pass even with 30 independent paired entries',()=>{
 const cutoff=Date.parse(MOMENTUM_BRACKET_CUTOFF);
 const rows=Array.from({length:32},(_,i)=>pair(i,cutoff+i*26*3600000,99,101)).flat();
 const result=evaluateMomentumBracket(rows);
 assert.equal(result.forwardHoldout.independentPairs,32);
 assert.ok(result.forwardHoldout.candidate.netPnlUsdt<0);
 assert.equal(result.status,'reject_no_positive_paired_edge');
});
test('research queries only corrected paper history without writing or touching trading settings',async()=>{
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{
  queries.push(sql);
  return sql.startsWith('SELECT COUNT')?{rows:[{n:0}]}:{rows:[]};
 }};
 const result=await momentumBracketResearch(pool as unknown as Parameters<typeof momentumBracketResearch>[0]);
 assert.equal(result.forwardHoldout.independentPairs,0);
 assert.equal(queries.length,2);
 assert.ok(queries.every(q=>q.startsWith('SELECT ')&&q.includes("execution_model='next-open-v2'")));
 assert.ok(queries.every(q=>q.includes("strategy='momentum_continuation'")&&q.includes("'bracket'")&&q.includes("'24h'")));
});
