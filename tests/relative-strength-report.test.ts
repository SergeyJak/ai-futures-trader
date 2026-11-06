import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeStrengthReport} from '../src/relative-strength-report.js';
const now=Date.parse('2026-11-07T03:00:00Z');
const fixture=()=>({status:'provisional-paper',start:'2026-11-06T01:00:00Z',as_of:'2026-11-07T01:00:00Z',orders:false,scheduled:false,scenarios:[{fee:.0006,slip:.0003,final:99.5,cash:99.9,dd_hourly_pct:1.2,funding:-.01,costs:.1,curve:[{at:Date.parse('2026-11-06T01:00:00Z'),equity:99.9,positions:{SOLUSDT:-.2}},{at:Date.parse('2026-11-07T01:00:00Z'),equity:99.5,positions:{SOLUSDT:-.2}}],events:[],decisions:[]}]});
test('missing checkpoint never substitutes historical profits or a live balance',()=>{
 const r=relativeStrengthReport(null,now);assert.equal(r.forward.status,'awaiting-report');assert.equal(r.forward.scenarios.length,0);assert.equal(r.history[0].final,113.85174539070248);
});
test('before start and stale checkpoint are distinct states',()=>{
 assert.equal(relativeStrengthReport(null,Date.parse('2026-11-05T12:00:00Z')).forward.status,'not-started');
 assert.equal(relativeStrengthReport(fixture(),now+3*86400000).forward.status,'stale');
});
test('forward equity is separate from cash and positions preserve short direction',()=>{
 const r=relativeStrengthReport(fixture(),now);assert.equal(r.forward.status,'ready');assert.equal(r.forward.scenarios[0].equity,99.5);assert.equal(r.forward.scenarios[0].positions[0].quantity,-.2);
});
test('future, malformed and inconsistent reports fail closed',()=>{
 const f=fixture();f.as_of='2030-01-01T00:00:00Z';assert.throws(()=>relativeStrengthReport(f,now));
 const x=fixture();x.scenarios[0].final=NaN;assert.throws(()=>relativeStrengthReport(x,now));
 const y=fixture();y.scenarios[0].final=101;assert.throws(()=>relativeStrengthReport(y,now));
});
