import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {tickV4} from '../src/v4-paper.js';

const url=process.env.TEST_DATABASE_URL;
test('V4 transaction updates only its accounts and never touches legacy paper account',{skip:!url},async()=>{
 const schema='v4isolation_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url});
 await admin.query('CREATE SCHEMA "'+schema+'"');
 const pool=new pg.Pool({connectionString:url,max:3,options:'-c search_path='+schema});
 try{
  await pool.query('CREATE TABLE market_candles(symbol text,start_at timestamptz,open numeric,high numeric,low numeric,close numeric,confirmed boolean)');
  await pool.query('CREATE TABLE v4_accounts(id text primary key,symbol text,side text,dip numeric,mode text,balance numeric,last_at timestamptz,position jsonb)');
  await pool.query('CREATE TABLE v4_trades(config_id text,symbol text,side text,mode text,entry_at timestamptz,exit_at timestamptz,entry_price numeric,exit_price numeric,quantity numeric,pnl numeric,fee_entry numeric,fee_exit numeric,mfe numeric,mae numeric,reason text)');
  await pool.query('CREATE TABLE paper_account(id int primary key,balance numeric)');
  await pool.query('INSERT INTO paper_account VALUES(1,123.45)');
  await pool.query("INSERT INTO v4_accounts VALUES('sol-long','SOLUSDT','LONG',0.002,'SL_TP',100,NULL,NULL),('eth-short','ETHUSDT','SHORT',0.004,'TIME_30',150,NULL,NULL)");
  const origin=Date.parse('2026-10-06T00:00:00Z');
  for(let i=0;i<34;i++)await pool.query('INSERT INTO market_candles VALUES($1,$2,100,101,99,100,1000)',['SOLUSDT',new Date(origin+i*60000).toISOString()]);
  const first=await tickV4(pool);
  assert.equal(first.changed,1);
  const accounts=await pool.query('SELECT id,balance,last_at FROM v4_accounts ORDER BY id');
  assert.equal(Number(accounts.rows[0].balance),150);
  assert.equal(Number(accounts.rows[1].balance),100);
  assert.equal(Number((await pool.query('SELECT balance FROM paper_account WHERE id=1')).rows[0].balance),123.45);
  const second=await tickV4(pool);
  assert.equal(second.changed,0);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM v4_trades')).rows[0].n),0);
  assert.equal(Number((await pool.query('SELECT balance FROM paper_account WHERE id=1')).rows[0].balance),123.45);
 }finally{
  await pool.end();
  await admin.query('DROP SCHEMA "'+schema+'" CASCADE');
  await admin.end();
 }
});
