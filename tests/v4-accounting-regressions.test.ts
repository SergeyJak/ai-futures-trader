import test from 'node:test';
import assert from 'node:assert/strict';
import {v4Advance} from '../src/v4-paper.js';

const minute=60_000;
const origin=Date.parse('2026-10-01T00:00:00Z');
const bars=(lastLow=99,lastHigh=101,lastOpen=100)=>Array.from({length:31},(_,i)=>({
 start_at:new Date(origin+i*minute).toISOString(),
 open:String(i===30?lastOpen:100),high:String(i===30?lastHigh:101),
 low:String(i===30?lastLow:99),close:'100'
}));
const state=(side:'LONG'|'SHORT',mode:'SL_TP'|'TIME_15'|'TRAILING'='SL_TP')=>({
 id:'test',symbol:'SOLUSDT',side,dip:.002,mode,balance:100,
 lastAt:new Date(origin+29*minute).toISOString(),
 position:{entry:100,entryAt:new Date(origin+20*minute).toISOString(),qty:1,stop:side==='LONG'?99:101,
 take:side==='LONG'?101:99,entryFee:.06,mfe:0,mae:0}
});
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`expected ${expected}, got ${actual}`);

test('V4 long: stop wins when stop and take both touch one candle',()=>{
 const r=v4Advance(state('LONG'),bars(98,102));
 assert.equal(r.event,'EXIT');assert.equal(r.trade?.reason,'STOP');
 const exit=99*(1-.0002);
 near(Number(r.trade?.pnl),(exit-100)-.06-exit*.0006);
 near(r.state.balance,100+(exit-100)-exit*.0006);
 assert.equal(r.state.position,null);
});
test('V4 short: stop wins when stop and take both touch one candle',()=>{
 const r=v4Advance(state('SHORT'),bars(98,102));
 assert.equal(r.event,'EXIT');assert.equal(r.trade?.reason,'STOP');
 const exit=101*(1+.0002);
 near(Number(r.trade?.pnl),-(exit-100)-.06-exit*.0006);
 near(r.state.balance,100-(exit-100)-exit*.0006);
});
test('V4 take-profit subtracts both entry and exit fees from recorded PnL',()=>{
 const r=v4Advance(state('LONG'),bars(100,102));
 assert.equal(r.trade?.reason,'TAKE');
 const exit=101*(1-.0002);
 near(Number(r.trade?.pnl),(exit-100)-.06-exit*.0006);
});
test('V4 time exit uses candle open with slippage',()=>{
 const s=state('LONG','TIME_15');s.position.entryAt=new Date(origin+15*minute).toISOString();
 const r=v4Advance(s,bars(99.5,100.5,100));
 assert.equal(r.trade?.reason,'TIME');
 near(Number(r.trade?.exit),100*(1-.0002));
});
test('V4 duplicate candle is idempotent and does not change balance',()=>{
 const s=state('LONG');s.lastAt=new Date(origin+30*minute).toISOString();
 const r=v4Advance(s,bars(98,102));
 assert.equal(r.event,'SEEN');assert.equal(r.trade,null);near(r.state.balance,100);
});
test('V4 missing minute is skipped without synthetic trade',()=>{
 const s=state('LONG');s.lastAt=new Date(origin+28*minute).toISOString();
 const r=v4Advance(s,bars(98,102));
 assert.equal(r.event,'GAP');assert.equal(r.trade,null);near(r.state.balance,100);
});
test('V4 no intrabar exit retains position and balance',()=>{
 const r=v4Advance(state('LONG'),bars(99.5,100.5));
 assert.equal(r.event,'WAIT');assert.equal(r.trade,null);
 assert.ok(r.state.position);near(r.state.balance,100);
});
