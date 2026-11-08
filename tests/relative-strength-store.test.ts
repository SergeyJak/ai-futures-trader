import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {RelativeStrengthStore} from '../src/relative-strength-store.js';
test('PostgreSQL durable checkpoint and cross-replica locking',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});const schema='forward_test_'+Date.now();let pool:pg.Pool|undefined;
 try{await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:3,options:'-c search_path='+schema});await pool.query('CREATE TABLE relative_strength_forward (evidence TEXT)');await pool.query("INSERT INTO relative_strength_forward VALUES ('original-100-USDT')");const a=new RelativeStrengthStore(pool),b=new RelativeStrengthStore(pool);await a.init();await b.init();assert.equal((await pool.query('SELECT evidence FROM relative_strength_forward')).rows[0].evidence,'original-100-USDT');
 await a.withLock(async lease=>{assert.equal(await b.withLock(async()=>{throw Error('Duplicate writer')}),false);await lease.save({packet:{source:'fixture'},checkpoint:{as_of:'2026-11-06T02:00:00Z'},status:null})});
 assert.deepEqual((await b.read()).checkpoint,{as_of:'2026-11-06T02:00:00Z'});
 await assert.rejects(()=>a.withLock(async()=>{throw Error('interrupted')}));assert.equal(await b.withLock(async()=>{}),true);
 }finally{await pool?.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}
});
