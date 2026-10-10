import test from 'node:test';import assert from 'node:assert/strict';import {V4_CONFIGS,v4Advance} from '../src/v4-paper.js';import {readFileSync} from 'node:fs';
const at=(i:number)=>new Date(Date.parse('2026-10-10T09:00:00Z')+i*60000).toISOString();
const mk=(i:number,open=100,high=100.01,low=99.99,close=100)=>({start_at:at(i),open:String(open),high:String(high),low:String(low),close:String(close)});
const state=(side:'LONG'|'SHORT',mode='TIME_15')=>({id:'x',symbol:'BTCUSDT',side,dip:.002,mode:mode as 'TIME_15',balance:100,lastAt:null,position:null});
test('v4 36 mirrored pairs with six independent exit modes',()=>{
 assert.equal(V4_CONFIGS.length,72);const keys=new Map<string,number>();for(const c of V4_CONFIGS){const key=[c.symbol,c.dip,c.mode].join(':');keys.set(key,(keys.get(key)||0)+1)}assert.equal(keys.size,36);assert.ok([...keys.values()].every(v=>v===2));
});
test('v4 instant stop charges commission and idempotency',()=>{
 const candles=Array.from({length:31},(_,i)=>mk(i));candles[30]=mk(30,100,101,99.2,99.6);
 const first=v4Advance(state('LONG'),candles);assert.equal(first.event,'EXIT');assert.equal(first.trade?.reason,'ENTRY_STOP_BOUND');assert.ok(first.state.balance<100);assert.equal(v4Advance(first.state,candles).event,'SEEN');
});
test('v4 compares same initial signal across exit policies',()=>{
 const candles=Array.from({length:31},(_,i)=>mk(i));candles[30]=mk(30,100,100.01,99.75,99.85);
 const a=v4Advance(state('LONG','TIME_15'),candles),b=v4Advance(state('LONG','SL_TP'),candles);
 assert.equal(a.event,'ENTRY');assert.equal(b.event,'ENTRY');assert.equal(a.state.position?.entry,b.state.position?.entry);
});
test('v4 isolated and connected',()=>{
 const source=readFileSync('src/v4-paper.ts','utf8'),server=readFileSync('src/index.ts','utf8');
 assert.ok(source.includes('v4_trades'));assert.ok(!source.includes('UPDATE v3_accounts'));assert.ok(server.includes("req.url==='/api/v4'"));assert.ok(server.includes('runIndependentV4'));assert.ok(server.includes('initV4()'));
});
