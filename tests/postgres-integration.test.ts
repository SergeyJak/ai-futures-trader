import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {paperTick} from '../src/paper.js';

const connectionString=process.env.TEST_DATABASE_URL;
test('PostgreSQL paper tick persists cursor atomically and replay is idempotent',{skip:!connectionString},async()=>{
 const pool=new pg.Pool({connectionString,max:2});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE TEMP TABLE market_candles(symbol text,start_at timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,confirmed boolean)');
  await client.query('CREATE TEMP TABLE paper_account(id integer primary key,last_at timestamptz,balance numeric,position jsonb,updated_at timestamptz)');
  await client.query('CREATE TEMP TABLE paper_trades(symbol text,side text,quantity numeric,entry_price numeric,exit_price numeric,entry_at timestamptz,exit_at timestamptz,pnl numeric,reason text)');
  await client.query('CREATE TEMP TABLE paper_decisions(account_id integer,at timestamptz,symbol text,event text,reason text,details jsonb)');
  const origin=Date.parse('2026-10-01T00:00:00Z');
  for(let i=0;i<40;i++)await client.query('INSERT INTO market_candles VALUES($1,$2,100,100.5,99.5,100,1000,true)',['SOLUSDT',new Date(origin+i*60000).toISOString()]);
  await client.query('INSERT INTO paper_account(id,last_at,balance,position) VALUES(1,$1,100,NULL)',[new Date(origin+38*60000).toISOString()]);
  // A pinned client ensures TEMP tables and both tick transactions use the same PostgreSQL session.
  const adapter={query:(...args:Parameters<typeof client.query>)=>(client.query as Function)(...args),connect:async()=>({query:(...args:Parameters<typeof client.query>)=>(client.query as Function)(...args),release(){}})} as unknown as pg.Pool;
  await client.query('COMMIT');
  await paperTick(adapter,['SOLUSDT']);
  const first=await client.query('SELECT last_at,balance,position FROM paper_account WHERE id=1');
  assert.equal(new Date(first.rows[0].last_at).toISOString(),new Date(origin+39*60000).toISOString());
  await paperTick(adapter,['SOLUSDT']);
  const second=await client.query('SELECT last_at,balance,position FROM paper_account WHERE id=1');
  assert.deepEqual(second.rows,first.rows);
  const trades=await client.query('SELECT COUNT(*)::int AS n FROM paper_trades');
  assert.equal(trades.rows[0].n,0);
 }finally{try{await client.query('ROLLBACK')}catch{}client.release();await pool.end()}
});


test('PostgreSQL rolls back account cursor when update fails, then retries safely',{skip:!connectionString},async()=>{
 const pool=new pg.Pool({connectionString,max:1});
 const client=await pool.connect();
 const origin=Date.parse('2026-10-02T00:00:00Z');
 const at=(i:number)=>new Date(origin+i*60000).toISOString();
 try{
  await client.query('CREATE TEMP TABLE market_candles(symbol text,start_at timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,confirmed boolean)');
  await client.query('CREATE TEMP TABLE paper_account(id integer primary key,last_at timestamptz,balance numeric,position jsonb,updated_at timestamptz)');
  await client.query('CREATE TEMP TABLE paper_trades(symbol text,side text,quantity numeric,entry_price numeric,exit_price numeric,entry_at timestamptz,exit_at timestamptz,pnl numeric,reason text)');
  await client.query('CREATE TEMP TABLE paper_decisions(account_id integer,at timestamptz,symbol text,event text,reason text,details jsonb)');
  for(let i=0;i<40;i++)await client.query('INSERT INTO market_candles VALUES($1,$2,100,100.5,99.5,100,1000,true)',['SOLUSDT',at(i)]);
  await client.query('INSERT INTO paper_account(id,last_at,balance,position) VALUES(1,$1,100,NULL)',[at(38)]);
  await client.query(`CREATE FUNCTION pg_temp.reject_paper_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced account write failure'; END $$`);
  await client.query('CREATE TRIGGER fail_paper_update BEFORE UPDATE ON paper_account FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_paper_update()');
  const adapter={query:(...args:Parameters<typeof client.query>)=>(client.query as Function)(...args),connect:async()=>({query:(...args:Parameters<typeof client.query>)=>(client.query as Function)(...args),release(){}})} as unknown as pg.Pool;
  await assert.rejects(()=>paperTick(adapter,['SOLUSDT']),/forced account write failure/);
  const unchanged=await client.query('SELECT last_at,balance FROM paper_account WHERE id=1');
  assert.equal(new Date(unchanged.rows[0].last_at).toISOString(),at(38));
  assert.equal(Number(unchanged.rows[0].balance),100);
  await client.query('DROP TRIGGER fail_paper_update ON paper_account');
  await paperTick(adapter,['SOLUSDT']);
  const recovered=await client.query('SELECT last_at,balance FROM paper_account WHERE id=1');
  assert.equal(new Date(recovered.rows[0].last_at).toISOString(),at(39));
  assert.equal(Number(recovered.rows[0].balance),100);
  await paperTick(adapter,['SOLUSDT']);
  const afterReplay=await client.query('SELECT last_at,balance FROM paper_account WHERE id=1');
  assert.deepEqual(afterReplay.rows,recovered.rows);
 }finally{client.release();await pool.end()}
});
