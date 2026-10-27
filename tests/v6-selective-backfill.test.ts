import test from 'node:test';
import assert from 'node:assert/strict';
import {backfillV6EntryCandles,selectV6BackfillTargets,v6BackfillCooldownMs,v6MissingEntryMinutes} from '../src/v6-selective-backfill.js';
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
 assert.match(sql,/e.confirmed=true/);
 assert.match(sql,/interval '21 minutes'/);
 assert.match(sql,/interval '1 minute'/);
 assert.match(sql,/COUNT\(DISTINCT e.start_at\)=21/);
 assert.match(sql,/SELECT DISTINCT ON \(symbol\) symbol,opened_ms FROM missing[\s\S]*ORDER BY symbol,opened_ms DESC[\s\S]*\) newest_per_symbol[\s\S]*ORDER BY opened_ms DESC LIMIT 150/);
});


test('entry window audit rejects gaps, duplicates and unconfirmed minutes',()=>{
 const end=now-60_000,start=end-20*60_000;
 const candle=(i:number,confirmed=true)=>({symbol:'TESTUSDT',startMs:start+i*60_000,open:'1',high:'1',low:'1',close:'1',volume:'1',turnover:'1',confirmed});
 const full=Array.from({length:21},(_,i)=>candle(i));
 assert.equal(v6MissingEntryMinutes(full,'TESTUSDT',start,end),0);
 assert.equal(v6MissingEntryMinutes([...full.slice(0,20),full[0]],'TESTUSDT',start,end),1);
 assert.equal(v6MissingEntryMinutes([...full.slice(0,20),candle(20,false)],'TESTUSDT',start,end),1);
 assert.equal(v6MissingEntryMinutes([...full.slice(0,20),{...candle(20),symbol:'OTHERUSDT'}],'TESTUSDT',start,end),1);
});

test('partial provider history is saved but flagged, never reported as a complete window',async()=>{
 const rows=[{symbol:'AUDITONEUSDT',opened_ms:String(now-2*3600000)},{symbol:'AUDITTWOUSDT',opened_ms:String(now-3*3600000)}];
 const pool={query:async(sql:string)=>sql.includes('confirmed_minutes')?{rows:[{confirmed_minutes:20}]}:{rows}};
 const saved:string[]=[];
 const load=async(symbol:string,start:number)=>{
  const count=symbol==='AUDITONEUSDT'?20:21;
  return Array.from({length:count},(_,i)=>({symbol,startMs:start+i*60_000,open:'1',high:'1',low:'1',close:'1',volume:'1',turnover:'1',confirmed:true}));
 };
 const result=await backfillV6EntryCandles(pool as never,async c=>{saved.push(c.symbol)},now,load);
 assert.deepEqual(result.targets,['AUDITONEUSDT','AUDITTWOUSDT']);
 assert.equal(result.saved,41);
 assert.equal(saved.length,41);
 assert.equal(result.errors.length,1);
 assert.match(result.errors[0],/AUDITONEUSDT: incomplete entry window \(1 missing confirmed minutes\)/);
});

test('partial provider response is not a false gap when saved and existing candles cover the window',async()=>{
 const rows=[{symbol:'UNIONUSDT',opened_ms:String(now-2*3600000)}];
 const queries:{sql:string;params?:unknown[]}[]=[];
 const pool={query:async(sql:string,params?:unknown[])=>{
  queries.push({sql,params});
  return sql.includes('confirmed_minutes')?{rows:[{confirmed_minutes:21}]}:{rows};
 }};
 const saved:number[]=[];
 const load=async(symbol:string,start:number)=>Array.from({length:20},(_,i)=>({
  symbol,startMs:start+i*60_000,open:'1',high:'1',low:'1',close:'1',volume:'1',turnover:'1',confirmed:true
 }));
 const result=await backfillV6EntryCandles(pool as never,async c=>{saved.push(c.startMs)},now,load);
 assert.equal(saved.length,20);
 assert.deepEqual(result.errors,[]);
 assert.equal(queries.length,2);
 assert.match(queries[1].sql,/COUNT\\(DISTINCT start_at\\)::int AS confirmed_minutes/);
 assert.deepEqual(queries[1].params?.slice(0,1),['UNIONUSDT']);
});
