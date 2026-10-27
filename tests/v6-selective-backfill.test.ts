import test from 'node:test';
import assert from 'node:assert/strict';
import {backfillV6EntryCandles,selectV6BackfillTargets,v6BackfillCooldownMs} from '../src/v6-selective-backfill.js';
const now=Date.parse('2026-10-11T20:00:00Z');
test('prioritizes latest eligible closed entry per symbol and rejects invalid inputs',()=>{
 const rows=[
  {symbol:'HYPEUSDT',openedMs:now-3600000},
  {symbol:'HYPEUSDT',openedMs:now-3500000},
  {symbol:'ZECUSDT',openedMs:now-7200000},
  {symbol:'BTCUSDC',openedMs:now-5400000},
  {symbol:'BAD/USD',openedMs:now-3600000},
  {symbol:'SOLUSDT',openedMs:now+60000},
  {symbol:'ETHUSDT',openedMs:now-91*86400000},
 ];
 assert.deepEqual(selectV6BackfillTargets(rows,now),[
  {symbol:'HYPEUSDT',openedMs:now-3500000},
  {symbol:'BTCUSDC',openedMs:now-5400000},
 ]);
 assert.deepEqual(selectV6BackfillTargets(rows,now,3),[
  {symbol:'HYPEUSDT',openedMs:now-3500000},
  {symbol:'BTCUSDC',openedMs:now-5400000},
  {symbol:'ZECUSDT',openedMs:now-7200000},
 ]);
});
test('limits work to distinct symbols and skips blocked invalid instruments',()=>{
 const rows=[
 ...Array.from({length:12},(_,i)=>({symbol:'1000SATSUSDT',openedMs:now-(i+1)*3600000})),
 {symbol:'HYPEUSDT',openedMs:now-3600000},
 {symbol:'ZECUSDT',openedMs:now-7200000},
 ];
 assert.deepEqual(selectV6BackfillTargets(rows,now,2,new Set(['1000SATSUSDT'])),[
 {symbol:'HYPEUSDT',openedMs:now-3600000},
 {symbol:'ZECUSDT',openedMs:now-7200000},
 ]);
 assert.equal(selectV6BackfillTargets(rows,now,2).length,2);
 assert.equal(selectV6BackfillTargets(rows,now,2).filter(x=>x.symbol==='1000SATSUSDT').length,1);
});
test('invalid exchange symbols have long cooldown, transient failures short cooldown',()=>{
 assert.equal(v6BackfillCooldownMs('Bybit history error: params error: Symbol Is Invalid'),86400000);
 assert.equal(v6BackfillCooldownMs('HTTP 429'),7200000);
 assert.equal(v6BackfillCooldownMs('Bybit rate limit exceeded'),7200000);
 assert.equal(v6BackfillCooldownMs('Too Many Requests'),7200000);
 assert.equal(v6BackfillCooldownMs('temporary network failure'),3600000);
});

test('database candidate query ranks recent missing symbols after deduplication',async()=>{
 let sql='';
 const pool={query:async(query:string)=>{sql=query;return {rows:[]}}};
 const result=await backfillV6EntryCandles(pool as never,async()=>{},now);
 assert.deepEqual(result.targets,[]);
 assert.match(sql,/JOIN market_candles m ON m.symbol=e.symbol AND m.confirmed=true/);
 assert.match(sql,/JOIN market_candles p ON p.symbol=e.symbol AND p.confirmed=true/);
 assert.match(sql,/interval '16 minutes'/);
 assert.match(sql,/e.confirmed=true/);
 assert.match(sql,/SELECT DISTINCT ON \(symbol\) symbol,opened_ms FROM missing[\s\S]*ORDER BY symbol,opened_ms DESC[\s\S]*\) newest_per_symbol[\s\S]*ORDER BY opened_ms DESC LIMIT 150/);
});

