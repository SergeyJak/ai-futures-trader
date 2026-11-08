import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeStrengthReport} from '../src/relative-strength-report.js';
const now=Date.parse('2026-11-10T03:00:00Z');
const fixture=()=>({status:'provisional-paper',start:'2026-11-09T01:00:00Z',as_of:'2026-11-10T01:00:00Z',initial_capital:1000,orders:false,scheduled:false,scenarios:[{fee:.0006,slip:.0003,final:999.5,cash:999.9,dd_hourly_pct:1.2,funding:-.01,costs:.1,curve:[{at:Date.parse('2026-11-09T01:00:00Z'),equity:999.9,positions:{SOLUSDT:-.2}},{at:Date.parse('2026-11-10T01:00:00Z'),equity:999.5,positions:{SOLUSDT:-.2}}],events:[],decisions:[]}]});
test('missing checkpoint never substitutes historical profits or a live balance',()=>{
 const r=relativeStrengthReport(null,now);assert.equal(r.forward.status,'awaiting-report');assert.equal(r.forward.scenarios.length,0);assert.equal(r.history[0].final,113.85174539070248);
});
test('before start and stale checkpoint are distinct states',()=>{
 assert.equal(relativeStrengthReport(null,Date.parse('2026-11-05T12:00:00Z')).forward.status,'not-started');
 assert.equal(relativeStrengthReport(fixture(),now+3*86400000).forward.status,'stale');
});
test('forward equity is separate from cash and positions preserve short direction',()=>{
 const r=relativeStrengthReport(fixture(),now);assert.equal(r.forward.status,'ready');assert.equal(r.forward.scenarios[0].equity,999.5);assert.equal(r.forward.scenarios[0].positions[0].quantity,-.2);
});
test('future, malformed and inconsistent reports fail closed',()=>{
 const f=fixture();f.as_of='2030-01-01T00:00:00Z';assert.throws(()=>relativeStrengthReport(f,now));
 const x=fixture();x.scenarios[0].final=NaN;assert.throws(()=>relativeStrengthReport(x,now));
 const y=fixture();y.scenarios[0].final=101;assert.throws(()=>relativeStrengthReport(y,now));
});
test('flat account reports rejected basket instead of hiding the reason',()=>{
 const f=fixture();(f.scenarios[0] as any).decisions=[{at:Date.parse(f.start),wanted:{BTCUSDT:-1},entered:[],rejected:'minimum_or_maximum_order:BTCUSDT'}];
 const r=relativeStrengthReport(f,now);assert.equal(r.forward.scenarios[0].lastDecision?.rejected,'minimum_or_maximum_order:BTCUSDT');
});
test('new test has 1000 starting capital and rejects legacy checkpoints',()=>{
 const r=relativeStrengthReport(null,Date.parse('2026-11-08T12:00:00Z'));assert.equal(r.forward.initialCapital,1000);assert.equal(r.forward.start,'2026-11-09T01:00:00Z');
 const old=fixture();(old as any).initial_capital=100;assert.throws(()=>relativeStrengthReport(old,now));
});
