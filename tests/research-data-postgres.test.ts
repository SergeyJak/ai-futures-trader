import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {ResearchDataStore,type MarketSample} from '../src/research-data-store.js';
import {createServer,type Socket} from 'node:net';
import {createResearchData,researchDataConfig} from '../src/research-data-runtime.js';

test('PostgreSQL research schema, idempotent writes, history and retention work together',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});const client=await pool.connect();
 let storePool:pg.Pool|undefined;
 const schema='research_test_'+Date.now()+'_'+Math.floor(Math.random()*100000);
 try{
  await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
  storePool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:2,options:`-c search_path=${schema}`});
  const store=new ResearchDataStore(storePool);await store.init();await store.init();
  const now=Date.parse('2026-11-01T12:00:00Z');
  const row:MarketSample={symbol:'BTCUSDT',bucketAt:now,observedAt:now+1,exchangeAt:now,updateId:10,sequence:20,bid:100,ask:101,bidQuantity:2,askQuantity:3,bidDepthNotional:200,askDepthNotional:303,bidLevels:1,askLevels:1,markPrice:null,indexPrice:null,openInterest:null,indicativeFundingRate:null,nextFundingAt:null,tickerObservedAt:null,connectionId:'test'};
  await store.writeSamples([row]);await store.writeSamples([row]);assert.equal((await store.samples('BTCUSDT',now-1,now+1)).length,1);
  await store.writeTradeBuckets([{symbol:'BTCUSDT',bucketAt:now,buys:1,sells:0,buyQuantity:2,sellQuantity:0,buyNotional:200,sellNotional:0,firstTradeAt:now,lastTradeAt:now,streamContinuous:false}]);
  assert.equal((await store.tradeHistory('BTCUSDT',now-1,now+1)).length,1);
  await store.writeFunding([{symbol:'BTCUSDT',fundingAt:now,rate:'-0.000123456789',fetchedAt:now}]);await store.writeFunding([{symbol:'BTCUSDT',fundingAt:now,rate:'-0.000123456789',fetchedAt:now+1}]);
  const funding=await store.funding('BTCUSDT',now-1,now+1);assert.equal(funding.length,1);assert.equal(funding[0].rate,'-0.000123456789');
  await store.saveStatus('runtime',{connected:false});assert.equal((await store.report(['BTCUSDT'])).status.length,1);
  await store.writeSamples([{...row,bucketAt:now-8*86400000}]);
  await store.writeSamples(Array.from({length:5000},(_,i)=>({...row,bucketAt:now-8*86400000-(i+1)*10000})));
  await store.prune(now,7);
  assert.equal(Number((await client.query('SELECT COUNT(*) AS n FROM research_market_samples')).rows[0].n),2);
  await store.prune(now,7);
  assert.equal(Number((await client.query('SELECT COUNT(*) AS n FROM research_market_samples')).rows[0].n),1);
 }finally{await storePool?.end();await client.query('SET search_path TO public');await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);client.release();await pool.end()}
});

test('research startup is bounded when a database accepts TCP but never completes its handshake',{skip:!process.env.TEST_DATABASE_URL,timeout:15000},async()=>{
 const sockets=new Set<Socket>();const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const address=server.address();assert.ok(address&&typeof address==='object');
 const {runtime}=createResearchData(researchDataConfig({},['BTCUSDT'],'wss://stream.bybit.com/v5/public/linear'),`postgres://test:test@127.0.0.1:${address.port}/test`);
 let timeout:ReturnType<typeof setTimeout>|undefined;const started=runtime.start();
 try{
  const bounded=await Promise.race([started.then(()=>true),new Promise<boolean>(resolve=>{timeout=setTimeout(()=>resolve(false),8000)})]);
  assert.equal(bounded,true,'database connection/acquisition must time out instead of stalling startup');
  assert.equal(runtime.status.storageReady,false);assert.match(runtime.status.lastError??'',/connection|timeout|timed out/i);
 }finally{
  if(timeout)clearTimeout(timeout);for(const socket of sockets)socket.destroy();await started;await runtime.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
