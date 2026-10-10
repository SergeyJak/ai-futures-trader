import test from 'node:test';
import assert from 'node:assert/strict';
import {researchSignal,evaluateCandidate} from '../src/research.js';
const base=Date.parse('2026-10-01T00:00:00Z');
const rows=Array.from({length:150},(_,i)=>({start_at:new Date(base+i*60000).toISOString(),open:'100',high:'100.1',low:'99.9',close:'100',volume:'100'}));
test('research candidates require enough history',()=>{assert.equal(researchSignal(rows.slice(0,30),'squeeze'),null);assert.equal(researchSignal(rows.slice(0,30),'regime'),null)});
test('flat markets do not emit buy or sell signals',()=>{assert.equal(researchSignal(rows,'squeeze'),null);assert.equal(researchSignal(rows,'regime'),null)});
test('evaluators do not invent profits on flat candles',()=>{for(const candidate of ['squeeze','regime'] as const){const r=evaluateCandidate(rows,candidate,'SOLUSDT');assert.equal(r.balance,100);assert.equal(r.trades,0);assert.equal(r.candidate,candidate)}});
