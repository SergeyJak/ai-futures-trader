import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {paperTick} from '../src/paper.js';

const t0=Date.parse('2026-10-01T00:00:00Z');
const at=(minute:number)=>new Date(t0+minute*60000).toISOString();
type Side='LONG'|'SHORT';
function fixture(side:Side,exit:'STOP'|'TAKE',alreadyProcessed=false){
 const statements:{sql:string;args:unknown[]}[]=[];
 const entry=100,qty=1,stop=side==='LONG'?99:101,take=side==='LONG'?101:99;
 const last=side==='LONG'?(exit==='STOP'?98:100):(exit==='STOP'?100:98);
 const high=side==='LONG'?(exit==='STOP'?100:102):(exit==='STOP'?102:100);
 const bars=Array.from({length:40},(_,i)=>({
  start_at:at(i),open:'100',high:String(i===39?high:100.5),
  low:String(i===39?last:99.5),close:'100',volume:'100'
 }));
 const position={symbol:'SOLUSDT',side,qty,entry,stop,take,entryAt:at(30)};
 const query=async(sql:string,args:unknown[]=[])=>{
  statements.push({sql,args});
  if(sql.includes('FROM market_candles'))return {rows:[...bars].reverse()};
  if(sql.includes('FROM paper_account'))return {rows:[{last_at:at(alreadyProcessed?39:38),balance:'99.94',position}]};
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
 return {pool,statements,position};
}
for(const side of ['LONG','SHORT'] as const)for(const exit of ['STOP','TAKE'] as const){
 test(`paper ${side} ${exit} reconciles trade PnL with account balance`,async()=>{
  const f=fixture(side,exit);await paperTick(f.pool,['SOLUSDT']);
  const trade=f.statements.find(s=>s.sql.includes('INSERT INTO paper_trades'));
  const update=f.statements.find(s=>s.sql.includes('UPDATE paper_account'));
  assert.ok(trade);assert.ok(update);
  const a=trade.args;
  assert.equal(a[8],exit);
  const price=Number(a[4]),pnl=Number(a[7]);
  const direction=side==='LONG'?1:-1;
  const gross=(price-100)*direction;
  const expectedPnl=gross-100*.0006-price*.0006;
  assert.ok(Math.abs(pnl-expectedPnl)<1e-10);
  const expectedBalance=99.94+gross-price*.0006;
  assert.ok(Math.abs(Number(update.args[0])-expectedBalance)<1e-10);
  assert.equal(update.args[1],'null');
  assert.equal(f.statements.at(-1)?.sql,'COMMIT');
 });
}
test('already processed close candle never writes duplicate trade or balance',async()=>{
 const f=fixture('LONG','STOP',true);await paperTick(f.pool,['SOLUSDT']);
 assert.equal(f.statements.filter(s=>s.sql.includes('INSERT INTO paper_trades')).length,0);
 assert.equal(f.statements.filter(s=>s.sql.includes('UPDATE paper_account')).length,0);
 assert.equal(f.statements.at(-1)?.sql,'COMMIT');
});
