import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ResearchDataStore, type MarketSample, type TradeBucket} from '../src/research-data-store.js';

function fixture(){
 const calls:{sql:string;values?:unknown[]}[]=[];
 const pool={async query(sql:string,values?:unknown[]){calls.push({sql,values});return {rows:[]}}};
 return {store:new ResearchDataStore(pool),calls};
}
const now=Date.parse('2026-11-01T12:00:00Z');
const sample:MarketSample={symbol:'BTCUSDT',bucketAt:now,observedAt:now+100,exchangeAt:now+90,updateId:10,sequence:12,bid:100,ask:101,bidQuantity:2,askQuantity:3,bidDepthNotional:200,askDepthNotional:303,bidLevels:1,askLevels:1,markPrice:null,indexPrice:null,openInterest:null,indicativeFundingRate:null,nextFundingAt:null,tickerObservedAt:null,connectionId:'connection-1'};
const bucket:TradeBucket={symbol:'BTCUSDT',bucketAt:now,buys:1,sells:0,buyQuantity:2,sellQuantity:0,buyNotional:200,sellNotional:0,firstTradeAt:now+10,lastTradeAt:now+10,streamContinuous:false};

test('research writes use bounded parameterized idempotent records and retain missing prices as null',async()=>{
 const {store,calls}=fixture();await store.writeSamples([sample]);await store.writeTradeBuckets([bucket]);
 assert.equal(calls.length,2);assert.match(calls[0].sql,/ON CONFLICT.*DO NOTHING/s);assert.match(calls[1].sql,/ON CONFLICT.*DO NOTHING/s);
 assert.ok(!calls[0].sql.includes('BTCUSDT'));
 const saved=JSON.parse(String(calls[0].values?.[0]));assert.equal(saved[0].mark_price,null);assert.equal(saved[0].bucket_at,'2026-11-01T12:00:00.000Z');
 assert.equal(JSON.parse(String(calls[1].values?.[0]))[0].stream_continuous,false);
});
test('funding preserves signed decimal rate and never inserts invented missing funding',async()=>{
 const {store,calls}=fixture();await store.writeFunding([]);assert.equal(calls.length,0);
 await store.writeFunding([{symbol:'ETHUSDT',fundingAt:now,rate:'-0.000123456789',fetchedAt:now+100}]);
 const row=JSON.parse(String(calls[0].values?.[0]))[0];assert.equal(row.rate,'-0.000123456789');assert.match(calls[0].sql,/IS DISTINCT FROM/);
});
test('retention is time-indexed, batch bounded, and cannot delete old candle/trade history',async()=>{
 const {store,calls}=fixture();await store.prune(now,7);
 assert.equal(calls.length,3);
 for(const c of calls){assert.match(c.sql,/LIMIT 5000/);assert.ok(!/market_candles|paper_trades/.test(c.sql));assert.ok(c.values?.[0]);}
 await assert.rejects(()=>store.prune(now,0),/retention/i);
});
test('coverage exposes empty/missing collections rather than financial zero estimates',async()=>{
 const {store}=fixture();const report=await store.report(['BTCUSDT']);
 assert.deepEqual(report.samples,[]);assert.deepEqual(report.funding,[]);assert.equal(report.fundingCashFlowVerified,false);
 assert.equal(report.feeRatesVerified,false);assert.ok(report.limitations.some(x=>/missing/i.test(x)));
});
test('history reads reject oversized ranges before querying and enforce bounded result limits',async()=>{
 const {store,calls}=fixture();
 await assert.rejects(()=>store.samples('BTCUSDT',now-25*3600000,now),/range/i);
 await assert.rejects(()=>store.funding('BTCUSDT',now-32*86400000,now),/range/i);
 await assert.rejects(()=>store.tradeHistory('BTCUSDT',now-25*3600000,now),/range/i);
 assert.equal(calls.length,0);await store.samples('BTCUSDT',now-3600000,now);assert.match(calls[0].sql,/LIMIT 1500/);
});
