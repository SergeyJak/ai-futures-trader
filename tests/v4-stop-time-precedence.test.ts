import test from 'node:test';
import assert from 'node:assert/strict';
import {v4Advance} from '../src/v4-paper.js';
const at=(i:number)=>new Date(Date.parse('2026-10-08T00:00:00Z')+i*60000).toISOString();
const bars=Array.from({length:31},(_,i)=>({start_at:at(i),open:'100',high:'101',low:'98',close:'100'}));
function state(mode:'TIME_15'|'TIME_30'|'SL_TP',side:'LONG'|'SHORT'='LONG'){
 return {id:'test',symbol:'SOLUSDT',side,dip:.002,mode,balance:99.94,lastAt:at(29),position:{entry:100,entryAt:at(0),qty:1,stop:side==='LONG'?99:101,take:side==='LONG'?101:99,entryFee:.06,mfe:0,mae:0}};
}
test('V4 stop takes precedence when TIME_15 expires on a candle also hitting stop',()=>{
 const r=v4Advance(state('TIME_15'),bars);
 assert.equal(r.event,'EXIT');
 assert.equal(r.trade?.reason,'STOP');
 assert.ok(Number(r.trade?.pnl)<0);
});
test('V4 stop takes precedence when TIME_30 expires on a candle also hitting stop',()=>{
 const r=v4Advance(state('TIME_30'),bars);
 assert.equal(r.trade?.reason,'STOP');
});
test('V4 short stop takes precedence when TIME_30 expires',()=>{
 const r=v4Advance(state('TIME_30','SHORT'),bars);
 assert.equal(r.trade?.reason,'STOP');
});
