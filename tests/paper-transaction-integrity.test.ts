import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {paperTick} from '../src/paper.js';

const start=Date.parse('2026-10-01T00:00:00Z');
const candles=Array.from({length:40},(_,i)=>({
 start_at:new Date(start+i*60000).toISOString(),open:'100',high:'100.5',low:'99.5',close:'100',volume:'1000'
}));
type Query={sql:string;params?:unknown[]};
const fake=(options:{lastAt?:string|null;failUpdate?:boolean}={})=>{
 const statements:Query[]=[];
 let released=0;
 const query=async(sql:string,params?:unknown[])=>{
  statements.push({sql,params});
  if(sql.includes('FROM market_candles'))return {rows:[...candles].reverse()};
  if(sql.includes('FROM paper_account'))return {rows:[{last_at:options.lastAt===undefined?new Date(start+39*60000).toISOString():options.lastAt,balance:'100',position:null}]};
  if(options.failUpdate&&sql.includes('UPDATE paper_account'))throw Error('simulated DB failure');
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release:()=>{released++}})} as unknown as pg.Pool;
 return {pool,statements,get released(){return released}};
};
test('paper tick does not write when latest candle has already been processed',async()=>{
 const f=fake();await paperTick(f.pool,['SOLUSDT']);
 assert.ok(f.statements.some(x=>x.sql==='BEGIN'));
 assert.ok(f.statements.some(x=>x.sql==='COMMIT'));
 assert.equal(f.statements.filter(x=>x.sql.includes('INSERT INTO paper_trades')).length,0);
 assert.equal(f.statements.filter(x=>x.sql.includes('UPDATE paper_account')).length,0);
 assert.equal(f.released,1);
});
test('paper tick rolls back and releases client if account update fails',async()=>{
 const f=fake({lastAt:null,failUpdate:true});
 await assert.rejects(()=>paperTick(f.pool,['SOLUSDT']),/simulated DB failure/);
 assert.ok(f.statements.some(x=>x.sql==='ROLLBACK'));
 assert.equal(f.statements.some(x=>x.sql==='COMMIT'),false);
 assert.equal(f.released,1);
});
test('paper tick initializes cursor without opening historical trades',async()=>{
 const f=fake({lastAt:null});await paperTick(f.pool,['SOLUSDT']);
 assert.equal(f.statements.filter(x=>x.sql.includes('INSERT INTO paper_trades')).length,0);
 assert.equal(f.statements.filter(x=>x.sql.includes('UPDATE paper_account')).length,1);
 assert.ok(f.statements.some(x=>x.sql==='COMMIT'));
});
test('paper tick rejects unsupported symbols before accessing database',async()=>{
 const f=fake();await assert.rejects(()=>paperTick(f.pool,['INVALID']),/Unsupported paper symbol/);
 assert.equal(f.statements.length,0);
});
test('paper tick skips long gaps without creating historical trades',async()=>{
 const f=fake({lastAt:new Date(start).toISOString()});await paperTick(f.pool,['SOLUSDT']);
 assert.equal(f.statements.filter(x=>x.sql.includes('INSERT INTO paper_trades')).length,0);
 assert.equal(f.statements.filter(x=>x.sql.includes('UPDATE paper_account')).length,1);
 assert.ok(f.statements.some(x=>x.sql==='COMMIT'));
});
