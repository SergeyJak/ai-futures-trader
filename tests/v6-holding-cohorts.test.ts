import test from 'node:test';import assert from 'node:assert/strict';
import {v6Insights} from '../src/v6-insights.js';
import {summarizeV6HoldingCohorts} from '../src/v6-holding-cohorts.js';
function obs(trader:string,days:number,i:number){const opened=Date.parse('2026-09-01T00:00:00Z')+i*86400000;return {trader_id:trader,kind:'history',raw:{symbol:'SOLUSDT',side:'LONG',opened_time:opened,closed_time:opened+days*86400000,status:'CLOSED',closing_pnl:2,closed_volume:1,avg_entry_price:100,avg_close_price:102}}}
test('cohorts only use fully closed, deduplicated position history',()=>{
 const rows=[...Array.from({length:5},(_,i)=>obs('short',.04,i)),...Array.from({length:5},(_,i)=>obs('long',3,i)),obs('short',.04,0),{...obs('open',2,0),kind:'open'},{...obs('partial',2,0),raw:{...obs('partial',2,0).raw,status:'PARTIAL'}}];
 const s=summarizeV6HoldingCohorts(v6Insights(rows));
 assert.equal(s.cohorts.find(c=>c.style==='intraday')?.closedPositions,5);
 assert.equal(s.cohorts.find(c=>c.style==='multiday')?.closedPositions,5);
 assert.equal(s.cohorts.find(c=>c.style==='swing')?.closedPositions,0);
 assert.equal(s.cohorts.find(c=>c.style==='intraday')?.estimatedNetBeforeSlippageAndFunding!==null,true);
});
test('missing fee inputs block net claims',()=>{
 const rows=Array.from({length:5},(_,i)=>({...obs('unknown',1,i),raw:{...obs('unknown',1,i).raw,closed_volume:null}}));
 const s=summarizeV6HoldingCohorts(v6Insights(rows));
 assert.equal(s.cohorts.find(c=>c.style==='swing')?.estimatedNetBeforeSlippageAndFunding,null);
});

test('empty V6 cohorts have no financial evidence, not a zero return',()=>{
 const report=summarizeV6HoldingCohorts(v6Insights([]));
 for(const cohort of report.cohorts){
  assert.equal(cohort.closedPositions,0);
  assert.equal(cohort.grossReportedPnl,null);
  assert.equal(cohort.estimatedFees,null);
  assert.equal(cohort.estimatedNetBeforeSlippageAndFunding,null);
 }
});
test('a populated cohort with verified zero gross PnL retains the real zero',()=>{
 const rows=Array.from({length:5},(_,i)=>({...obs('flat',.04,i),raw:{...obs('flat',.04,i).raw,closing_pnl:0}}));
 const cohort=summarizeV6HoldingCohorts(v6Insights(rows)).cohorts.find(c=>c.style==='intraday');
 assert.equal(cohort?.closedPositions,5);
 assert.equal(cohort?.grossReportedPnl,0);
 assert.ok((cohort?.estimatedFees??0)>0);
 assert.ok((cohort?.estimatedNetBeforeSlippageAndFunding??0)<0);
});
