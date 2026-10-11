import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {paperTick} from '../src/paper.js';

const url=process.env.TEST_DATABASE_URL;
test('two concurrent paper ticks close a position only once in PostgreSQL',{skip:!url},async()=>{
 const schema='concurrent_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url});
 await admin.query('CREATE SCHEMA "'+schema+'"');
 const pool=new pg.Pool({connectionString:url,max:4,options:'-c search_path='+schema});
 const at=(i:number)=>new Date(Date.parse('2026-10-04T00:00:00Z')+i*60000).toISOString();
 try{
  await pool.query('CREATE TABLE market_candles(symbol text,start_at timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,confirmed boolean)');
  await pool.query('CREATE TABLE paper_account(id integer primary key,last_at timestamptz,balance numeric,position jsonb,updated_at timestamptz)');
  await pool.query('CREATE TABLE paper_trades(symbol text,side text,quantity numeric,entry_price numeric,exit_price numeric,entry_at timestamptz,exit_at timestamptz,pnl numeric,reason text)');
  await pool.query('CREATE TABLE paper_decisions(account_id integer,at timestamptz,symbol text,event text,reason text,details jsonb)');
  for(let i=0;i<40;i++)await pool.query('INSERT INTO market_candles VALUES($1,$2,100,101,98,100,1000,true)',['SOLUSDT',at(i)]);
  const position={symbol:'SOLUSDT',side:'LONG',qty:1,entry:100,stop:99,take:101,entryAt:at(30)};
  await pool.query('INSERT INTO paper_account(id,last_at,balance,position) VALUES(1,$1,99.94,$2)',[at(38),JSON.stringify(position)]);
  await Promise.all([paperTick(pool,['SOLUSDT']),paperTick(pool,['SOLUSDT'])]);
  const trades=await pool.query('SELECT reason,pnl FROM paper_trades');
  assert.equal(trades.rowCount,1);
  assert.equal(trades.rows[0].reason,'STOP');
  const decisions=await pool.query("SELECT COUNT(*)::int AS n FROM paper_decisions WHERE event='CLOSE'");
  assert.equal(decisions.rows[0].n,1);
  const state=await pool.query('SELECT last_at,balance,position FROM paper_account WHERE id=1');
  assert.equal(new Date(state.rows[0].last_at).toISOString(),at(39));
  assert.equal(state.rows[0].position,null);
  const expected=99.94+(99*(1-.0002)-100)-99*(1-.0002)*.0006;
  assert.ok(Math.abs(Number(state.rows[0].balance)-expected)<1e-9);
 }finally{
  await pool.end();
  await admin.query('DROP SCHEMA "'+schema+'" CASCADE');
  await admin.end();
 }
});


test('waiting paper tick recovers after competing transaction rolls back',{skip:!url},async()=>{
 const schema='recovery_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url});
 await admin.query('CREATE SCHEMA "'+schema+'"');
 const pool=new pg.Pool({connectionString:url,max:4,options:'-c search_path='+schema});
 const at=(i:number)=>new Date(Date.parse('2026-10-05T00:00:00Z')+i*60000).toISOString();
 try{
  await pool.query('CREATE TABLE market_candles(symbol text,start_at timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,confirmed boolean)');
  await pool.query('CREATE TABLE paper_account(id integer primary key,last_at timestamptz,balance numeric,position jsonb,updated_at timestamptz)');
  await pool.query('CREATE TABLE paper_trades(symbol text,side text,quantity numeric,entry_price numeric,exit_price numeric,entry_at timestamptz,exit_at timestamptz,pnl numeric,reason text)');
  await pool.query('CREATE TABLE paper_decisions(account_id integer,at timestamptz,symbol text,event text,reason text,details jsonb)');
  for(let i=0;i<40;i++)await pool.query('INSERT INTO market_candles VALUES($1,$2,100,101,98,100,1000,true)',['SOLUSDT',at(i)]);
  const position={symbol:'SOLUSDT',side:'LONG',qty:1,entry:100,stop:99,take:101,entryAt:at(30)};
  await pool.query('INSERT INTO paper_account(id,last_at,balance,position) VALUES(1,$1,99.94,$2)',[at(38),JSON.stringify(position)]);
  const locker=await pool.connect();
  try{
   await locker.query('BEGIN');
   await locker.query('SELECT id FROM paper_account WHERE id=1 FOR UPDATE');
   // The first transaction holds the account row lock, then fails and rolls back.
   const waiting=paperTick(pool,['SOLUSDT']);
   await locker.query('ROLLBACK');
   await waiting;
  }finally{locker.release()}
  const trades=await pool.query('SELECT reason FROM paper_trades');
  assert.equal(trades.rowCount,1);
  assert.equal(trades.rows[0].reason,'STOP');
  const state=await pool.query('SELECT last_at,position FROM paper_account WHERE id=1');
  assert.equal(new Date(state.rows[0].last_at).toISOString(),at(39));
  assert.equal(state.rows[0].position,null);
  await paperTick(pool,['SOLUSDT']);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM paper_trades')).rows[0].n),1);
 }finally{
  await pool.end();
  await admin.query('DROP SCHEMA "'+schema+'" CASCADE');
  await admin.end();
 }
});
