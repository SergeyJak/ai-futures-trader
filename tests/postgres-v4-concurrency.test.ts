import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {tickV4} from '../src/v4-paper.js';

const url=process.env.TEST_DATABASE_URL;
test('concurrent V4 ticks close each account once without changing legacy paper balance',{skip:!url},async()=>{
 const schema='v4concurrent_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url});
 await admin.query('CREATE SCHEMA "'+schema+'"');
 const pool=new pg.Pool({connectionString:url,max:4,options:'-c search_path='+schema});
 const at=(i:number)=>new Date(Date.parse('2026-10-07T00:00:00Z')+i*60000).toISOString();
 try{
  await pool.query('CREATE TABLE market_candles(symbol text,start_at timestamptz,open numeric,high numeric,low numeric,close numeric,confirmed boolean)');
  await pool.query('CREATE TABLE v4_accounts(id text primary key,symbol text,side text,dip numeric,mode text,balance numeric,last_at timestamptz,position jsonb)');
  await pool.query('CREATE TABLE v4_trades(config_id text,symbol text,side text,mode text,entry_at timestamptz,exit_at timestamptz,entry_price numeric,exit_price numeric,quantity numeric,pnl numeric,fee_entry numeric,fee_exit numeric,mfe numeric,mae numeric,reason text)');
  await pool.query('CREATE TABLE paper_account(id int primary key,balance numeric)');
  await pool.query('INSERT INTO paper_account VALUES(1,555.55)');
  const position={entry:100,entryAt:at(30),qty:1,stop:99,take:101,entryFee:0.06,mfe:0,mae:0};
  await pool.query("INSERT INTO v4_accounts VALUES('sol-long','SOLUSDT','LONG',0.002,'SL_TP',99.94,$1,$2)",[at(32),JSON.stringify(position)]);
  for(let i=0;i<34;i++)await pool.query('INSERT INTO market_candles VALUES($1,$2,100,101,98,100,true)',['SOLUSDT',at(i)]);
  const results=await Promise.all([tickV4(pool),tickV4(pool)]);
  assert.equal(results.reduce((n,x)=>n+x.closed,0),1);
  const trades=await pool.query('SELECT reason,pnl FROM v4_trades');
  assert.equal(trades.rowCount,1);
  assert.equal(trades.rows[0].reason,'STOP');
  const state=await pool.query("SELECT balance,last_at,position FROM v4_accounts WHERE id='sol-long'");
  assert.equal(new Date(state.rows[0].last_at).toISOString(),at(33));
  assert.equal(state.rows[0].position,null);
  assert.equal(Number((await pool.query('SELECT balance FROM paper_account WHERE id=1')).rows[0].balance),555.55);
  const after=await tickV4(pool);
  assert.equal(after.closed,0);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM v4_trades')).rows[0].n),1);
 }finally{
  await pool.end();
  await admin.query('DROP SCHEMA "'+schema+'" CASCADE');
  await admin.end();
 }
});
