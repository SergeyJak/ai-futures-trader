import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {DIP_RESEARCH_CUTOFF,DIP_RESEARCH_RULES,scoreDipContinuationTrade,evaluateDipContinuation,dipContinuationResearch} from '../src/dip-continuation-research.js';

const MINUTE=60000;
function trade(id:number,entryAt:string,options:{gap?:boolean;flat?:boolean;lowVolume?:boolean;future?:boolean;side?:string}={}){
 const at=Date.parse(entryAt),bars=Array.from({length:60},(_,i)=>({
  time:new Date(at-(60-i)*MINUTE+(options.gap&&i===22?MINUTE:0)).toISOString(),
  close:100*(options.flat?1:1+i*.0001),
  volume:options.lowVolume?100:i<45?100:150
 }));
 if(options.future)bars[59].time=new Date(at).toISOString();
 return {id,side:options.side??'LONG',entry_at:entryAt,exit_at:new Date(at+720*MINUTE).toISOString(),
  entry_price:100,exit_price:102,net_pnl:.18,candles:bars};
}
test('pre-entry trend/volume/volatility candidate uses exactly 60 confirmed prior minutes',()=>{
 const t=trade(1,'2026-10-29T10:00:00.000Z');
 const score=scoreDipContinuationTrade(t);
 assert.ok(score);
 assert.equal(score.candidate,true);
 assert.equal(score.trendAligned,true);
 assert.equal(score.volumeRising,true);
 assert.equal(score.moderateVolatility,true);
 assert.ok(Math.abs(score.netPnl-.18788)<1e-9);
 assert.equal(scoreDipContinuationTrade(trade(2,'2026-10-29T10:00:00.000Z',{gap:true})),null);
 assert.equal(scoreDipContinuationTrade(trade(3,'2026-10-29T10:00:00.000Z',{future:true})),null);
 assert.equal(scoreDipContinuationTrade(trade(4,'2026-10-29T10:00:00.000Z',{flat:true}))?.candidate,false);
 assert.equal(scoreDipContinuationTrade(trade(5,'2026-10-29T10:00:00.000Z',{lowVolume:true}))?.candidate,false);
 assert.equal(scoreDipContinuationTrade(trade(6,'2026-10-29T10:00:00.000Z',{side:'BAD'})),null);
});
test('fixed chronological cutoff keeps development separate from true future holdout',()=>{
 assert.equal(DIP_RESEARCH_CUTOFF,'2026-10-30T00:00:00.000Z');
 assert.equal(DIP_RESEARCH_RULES.notionalUsdt,10);
 const rows=[
  trade(1,'2026-10-29T10:00:00.000Z'),
  trade(2,'2026-10-29T10:00:00.000Z'),
  trade(3,'2026-10-30T01:00:00.000Z'),
  trade(4,'2026-10-30T02:00:00.000Z',{gap:true})
 ];
 const result=evaluateDipContinuation(rows);
 assert.equal(result.quality.covered,2);
 assert.equal(result.quality.duplicates,1);
 assert.equal(result.quality.missingHistory,1);
 assert.equal(result.development.baseline.trades,1);
 assert.equal(result.development.independentBaseline.trades,1);
 assert.equal(result.forwardHoldout.baseline.trades,1);
 assert.equal(result.forwardHoldout.candidate.trades,1);
 assert.equal(result.forwardHoldout.independentCandidate.trades,1);
 assert.equal(result.status,'insufficient_forward_sample');
 assert.equal(result.funding,'not verified; excluded from all PnL');
 assert.equal(result.development.baseline.maxDrawdownClosedPct,0);
});
test('read-only research SQL only selects corrected paper trades and pre-entry confirmed candles',async()=>{
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.startsWith('SELECT COUNT'))return {rows:[{n:1}]};
  return {rows:[trade(1,'2026-10-29T10:00:00.000Z')]};
 }} as unknown as pg.Pool;
 const result=await dipContinuationResearch(pool);
 assert.equal(queries.length,2);
 assert.ok(queries.every(q=>q.startsWith('SELECT')));
 assert.match(queries[0],/execution_model='next-open-v2'/);
 assert.match(queries[0],/c.confirmed=true/);
 assert.match(queries[0],/c.start_at<t.entry_at/);
 assert.match(queries[0],/LIMIT 500/);
 assert.equal(result.development.candidate.trades,1);
 assert.equal(result.quality.truncated,false);
});

test('candidate is not an edge when all holdout trades pass and baseline is identical',()=>{
 const rows=Array.from({length:31},(_,i)=>trade(i+1,new Date(Date.parse(DIP_RESEARCH_CUTOFF)+i*13*3600000).toISOString()));
 const result=evaluateDipContinuation(rows);
 assert.equal(result.forwardHoldout.baseline.trades,31);
 assert.equal(result.forwardHoldout.candidate.trades,31);
 assert.equal(result.forwardHoldout.independentBaseline.trades,31);
 assert.equal(result.forwardHoldout.independentCandidate.trades,31);
 assert.equal(result.status,'reject_candidate_no_net_edge');
});

test('overlapping 12h positions cannot satisfy the independent forward sample threshold',()=>{
 const rows=Array.from({length:40},(_,i)=>trade(i+1,new Date(Date.parse(DIP_RESEARCH_CUTOFF)+i*3600000).toISOString()));
 const result=evaluateDipContinuation(rows);
 assert.equal(result.forwardHoldout.baseline.trades,40);
 assert.equal(result.forwardHoldout.candidate.trades,40);
 assert.equal(result.forwardHoldout.independentBaseline.trades,4);
 assert.equal(result.forwardHoldout.independentCandidate.trades,4);
 assert.equal(result.status,'insufficient_forward_sample');
});
test('earliest-exit selection maximizes non-overlapping trade evidence',()=>{
 const at=Date.parse(DIP_RESEARCH_CUTOFF);
 const first=trade(1,new Date(at).toISOString());
 first.exit_at=new Date(at+24*3600000).toISOString();
 const second=trade(2,new Date(at+3600000).toISOString());
 second.exit_at=new Date(at+2*3600000).toISOString();
 const third=trade(3,new Date(at+3*3600000).toISOString());
 third.exit_at=new Date(at+4*3600000).toISOString();
 const result=evaluateDipContinuation([first,second,third]);
 assert.equal(result.forwardHoldout.baseline.trades,3);
 assert.equal(result.forwardHoldout.independentBaseline.trades,2);
 assert.equal(result.forwardHoldout.independentCandidate.trades,2);
});
