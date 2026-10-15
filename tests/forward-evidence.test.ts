import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardEvidence} from '../src/forward-evidence.js';
const trade=(pnl:number,minutes:number)=>({net_pnl:pnl,entry_at:'2026-10-15T00:00:00Z',exit_at:new Date(Date.parse('2026-10-15T00:00:00Z')+minutes*60000).toISOString()});
test('calculates realized drawdown and holding time on closed virtual trades only',()=>{
 const r=forwardEvidence([trade(10,60),trade(-20,120),trade(5,240)]);
 assert.equal(r.closed,3);assert.equal(r.realizedNetPnl,-5);assert.equal(r.realizedMaxDrawdown,20/110);assert.equal(r.medianHoldMinutes,120);
 assert.equal(r.fundingIncluded,false);assert.equal(r.minimumEvidenceMet,false);
});
test('rejects invalid fills and never claims verification',()=>{
 const r=forwardEvidence([{...trade(5,60),exit_at:'2026-10-14T00:00:00Z'},trade(2,60)]);
 assert.equal(r.closed,1);assert.equal(r.independentExecutionVerified,false);
});
