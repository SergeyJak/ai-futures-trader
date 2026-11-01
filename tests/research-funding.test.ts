import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchFundingHistory,FundingHttpError} from '../src/research-funding.js';
const now=Date.parse('2026-11-01T12:00:00Z');
const row=(time:number,rate='0.0001')=>({symbol:'BTCUSDT',fundingRate:rate,fundingRateTimestamp:String(time)});
const response=(rows:unknown[])=>new Response(JSON.stringify({retCode:0,result:{list:rows}}),{status:200});
test('funding validates settlement rows, signs, time range and deduplicates',async()=>{
 const result=await fetchFundingHistory('BTCUSDT',now,async()=>response([row(now-1,'-0.0001'),row(now-1),row(now+60000),row(now-121*86400000),row(now-1000,'NaN')]));
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].rate,'-0.0001');assert.equal(result.rows[0].fundingAt,now-1);assert.equal(result.pages,1);
});
test('initial funding history covers the historical strategy window, bounded to 120 days',async()=>{
 let requested='';const result=await fetchFundingHistory('BTCUSDT',now,async url=>{requested=String(url);return response([row(now-90*86400000)])});
 assert.equal(result.rows.length,1);assert.equal(new URL(requested).searchParams.get('startTime'),String(now-120*86400000));
});
test('funding pagination uses oldest-time cursor and stops repeated pages with explicit incomplete evidence',async()=>{
 const urls:string[]=[];const batch=Array.from({length:200},(_,i)=>row(now-1000-i*60000));
 const result=await fetchFundingHistory('BTCUSDT',now,async url=>{urls.push(String(url));return response(batch)});
 assert.equal(result.rows.length,200);assert.equal(result.pages,2);assert.equal(result.complete,false);assert.match(result.reason??'',/repeat|progress/i);
 const first=new URL(urls[0]),second=new URL(urls[1]);assert.equal(first.searchParams.get('limit'),'200');assert.ok(Number(second.searchParams.get('endTime'))<Number(first.searchParams.get('endTime')));
});
test('403/429 are surfaced as typed HTTP failures and abort signal is forwarded',async()=>{
 for(const status of [403,429])await assert.rejects(()=>fetchFundingHistory('BTCUSDT',now,async()=>new Response('',{status})),(e:unknown)=>e instanceof FundingHttpError&&e.status===status);
 const controller=new AbortController();controller.abort();let called=false;
 await assert.rejects(()=>fetchFundingHistory('BTCUSDT',now,async()=>{called=true;return response([])},controller.signal));assert.equal(called,false);
});
test('a provider application error cannot be reported as zero funding',async()=>{
 await assert.rejects(()=>fetchFundingHistory('BTCUSDT',now,async()=>new Response(JSON.stringify({retCode:10006,retMsg:'rate limited'}))),/10006|rate limited/);
 const empty=await fetchFundingHistory('BTCUSDT',now,async()=>response([]));assert.deepEqual(empty.rows,[]);assert.equal(empty.complete,true);
});
test('exact duplicate settlement records are counted and leave coverage explicitly incomplete',async()=>{
 const result=await fetchFundingHistory('BTCUSDT',now,async()=>response([row(now-1),row(now-1)]));
 assert.equal(result.rows.length,1);assert.equal(result.duplicateRecords,1);assert.equal(result.complete,false);assert.equal(result.reason,'duplicate-records');
});
test('funding caps pages even if the provider has more than a thousand records',async()=>{
 let count=0;const result=await fetchFundingHistory('BTCUSDT',now,async()=>response(Array.from({length:200},(_,i)=>row(now-(count*200+i+1)*60000)).map((r,i,all)=>{if(i===all.length-1)count++;return r})));
 assert.equal(result.pages,5);assert.equal(result.rows.length,1000);assert.equal(result.complete,false);assert.match(result.reason??'',/page/i);
});
