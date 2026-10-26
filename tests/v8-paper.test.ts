import test from 'node:test';
import assert from 'node:assert/strict';
import {v8Exit,V8_CONFIGS} from '../src/v8-paper.js';
const position={side:'LONG' as const,entry:100,stop:98,take:104,quantity:1,entryAt:0};
test('V8 keeps six isolated BTC ETH SOL paper variants',()=>{assert.equal(V8_CONFIGS.length,6);assert.equal(new Set(V8_CONFIGS.map(c=>c.id)).size,6)});
test('V8 stop wins on same candle as take',()=>{assert.deepEqual(v8Exit(position,{time:60000,open:100,high:105,low:97,close:101}),{price:98,reason:'BOTH_STOP_FIRST'})});
test('V8 gaps fill at opening price on adverse stop',()=>{assert.deepEqual(v8Exit(position,{time:60000,open:95,high:99,low:94,close:98}),{price:95,reason:'STOP'})});
test('V8 time exit after 24h and short stop',()=>{assert.deepEqual(v8Exit(position,{time:24*3600000,open:100,high:101,low:99,close:100}),{price:100,reason:'TIME'});assert.equal(v8Exit({...position,side:'SHORT',stop:102,take:96},{time:60000,open:100,high:103,low:99,close:102})?.reason,'STOP')});

test('V8 audits an interrupted position instead of fabricating an exit or realized PnL',async()=>{
 const {tickV8Paper}=await import('../src/v8-paper.js');
 const last=Math.floor(Date.now()/60000)*60000-60000;
 const bars=Array.from({length:205},(_,i)=>({start_at:new Date(last-(204-i)*60000),open:100,high:101,low:99,close:100}));
 const queries:{sql:string;args:unknown[]|undefined}[]=[];
 const pool={connect:async()=>({query:async(sql:string,args?:unknown[])=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT start_at'))return {rows:args?.[0]==='SOLUSDT'?bars:[]};
  if(sql.startsWith('SELECT balance'))return {rows:[{
   balance:100,position:args?.[0]==='SOLUSDT-5m'?{side:'LONG',entry:100,stop:98,take:104,quantity:1,entryAt:last-3600000}:null,
   pending:{side:'SHORT',signalAt:last-120000,stop:102,take:96},
   last_bar:new Date(last-(args?.[0]==='SOLUSDT-5m'?120000:60000))
  }]};
  return {rows:[]};
 },release:()=>{}})};
 await tickV8Paper(pool as never);
 const audits=queries.filter(q=>q.sql.startsWith('INSERT INTO v8_paper_gap_audit'));
 assert.equal(audits.length,1);
 assert.equal(audits[0].args?.[0],'SOLUSDT-5m');
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO v8_paper_trades')).length,0);
 const resets=queries.filter(q=>q.sql.includes('SET last_bar=')&&q.sql.includes('position=NULL'));
 assert.equal(resets.length,1);
 assert.equal(resets[0].args?.[0],'SOLUSDT-5m');
 assert.ok(queries.some(q=>q.sql==='COMMIT'));
});
