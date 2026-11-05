import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MicrostructureState} from '../src/research-microstructure.js';
const now=Date.parse('2026-11-01T12:00:00Z');
const book=(type='snapshot',u=10,seq=20,b=[['100','2']],a=[['101','3']])=>({topic:'orderbook.50.BTCUSDT',type,ts:now,data:{s:'BTCUSDT',u,seq,b,a}});
const trade=(id:string,time=now+100,side='Buy')=>({topic:'publicTrade.BTCUSDT',data:[{i:id,T:time,s:'BTCUSDT',S:side,p:'100',v:'2'}]});
function fixture(options={}){const state=new MicrostructureState(['BTCUSDT'],options);state.connect('c1',now-10000);return state;}

test('book needs snapshot, applies delta removals, and tolerates nonconsecutive update IDs',()=>{
 const s=fixture();assert.equal(s.ingest(book('delta'),now).resync,true);assert.deepEqual(s.sample(now),[]);
 s.ingest(book(),now);s.ingest(book('delta',25,35,[['100','0'],['99','4']],[['101','5']]),now+10);
 const row=s.sample(now+20)[0];assert.equal(row.bid,99);assert.equal(row.bidQuantity,4);assert.equal(row.askQuantity,5);assert.equal(row.bidDepthNotional,396);assert.equal(row.sequence,35);
});
test('regression/crossed levels invalidate book; a new snapshot or update-1 restart resets state',()=>{
 const s=fixture();s.ingest(book(),now);assert.equal(s.ingest(book('delta',9,19),now+1).resync,true);assert.deepEqual(s.sample(now+2),[]);
 s.ingest(book('snapshot',1,1,[['90','1']],[['91','1']]),now+3);assert.equal(s.sample(now+4)[0].bid,90);
 assert.equal(s.ingest(book('delta',2,2,[['92','1']]),now+5).resync,true);assert.deepEqual(s.sample(now+6),[]);
});
test('a delta may omit an unchanged side, but a snapshot must establish both sides',()=>{
 const s=fixture();s.ingest(book(),now);
 const delta=book('delta',11,21);delete (delta.data as Partial<typeof delta.data>).a;
 assert.equal(s.ingest(delta,now+1).accepted,true);assert.equal(s.sample(now+2)[0].ask,101);
 const snapshot=book('snapshot',12,22);delete (snapshot.data as Partial<typeof snapshot.data>).a;
 assert.equal(s.ingest(snapshot,now+3).resync,true);assert.deepEqual(s.sample(now+4),[]);
});
test('stale book, reconnect and missing ticker fields never produce fresh invented prices',()=>{
 const s=fixture();s.ingest(book(),now);assert.equal(s.sample(now)[0].markPrice,null);
 s.ingest({topic:'tickers.BTCUSDT',type:'snapshot',ts:now,data:{symbol:'BTCUSDT',markPrice:'100.5',indexPrice:'100.4',fundingRate:'-0.0001',nextFundingTime:String(now+3600000)}},now);
 const row=s.sample(now+100)[0];assert.equal(row.markPrice,100.5);assert.equal(row.indicativeFundingRate,-.0001);assert.equal(row.nextFundingAt,now+3600000);
 assert.deepEqual(s.sample(now+30001),[]);s.disconnect(now+1000);s.connect('c2',now+2000);assert.deepEqual(s.sample(now+2000),[]);
 s.ingest(book('snapshot',40,40),now+2001);assert.equal(s.sample(now+2002)[0].markPrice,null);
});
test('ticker delta freshness is per field, not refreshed by unrelated updates',()=>{
 const s=fixture();s.ingest(book(),now);
 s.ingest({topic:'tickers.BTCUSDT',ts:now,data:{symbol:'BTCUSDT',markPrice:'100.5',indexPrice:'100.4'}},now);
 s.ingest({...book('delta',11,21),ts:now+31000},now+31000);
 s.ingest({topic:'tickers.BTCUSDT',ts:now+31000,data:{symbol:'BTCUSDT',indexPrice:'100.3'}},now+31000);
 const row=s.sample(now+31000)[0];assert.equal(row.markPrice,null);assert.equal(row.indexPrice,100.3);
});
test('a newly received stale ticker message cannot make old mark prices look current',()=>{
 const s=fixture();s.ingest(book(),now);
 s.ingest({topic:'tickers.BTCUSDT',ts:now-60000,data:{symbol:'BTCUSDT',markPrice:'999'}},now);
 assert.equal(s.sample(now)[0].markPrice,null);
});
test('trade duplicate IDs do not inflate aggregates; finalize only after lateness allowance',()=>{
 const s=fixture();s.ingest(trade('a'),now+110);s.ingest(trade('a'),now+120);s.ingest(trade('b',now+200,'Sell'),now+210);
 assert.deepEqual(s.drainTrades(now+39999),[]);const rows=s.drainTrades(now+40000);assert.equal(rows.length,1);
 assert.equal(rows[0].buys,1);assert.equal(rows[0].sells,1);assert.equal(rows[0].buyNotional,200);assert.equal(rows[0].sellQuantity,2);assert.equal(rows[0].streamContinuous,true);
 assert.deepEqual(s.drainTrades(now+50000),[]);assert.equal(s.status(now+50000).duplicateTrades,1);
});
test('late data and bounded dedup overflow are counted and cannot create fake complete zero buckets',()=>{
 const s=fixture({dedupLimit:2});s.ingest(trade('a'),now+110);s.ingest(trade('b'),now+120);s.ingest(trade('c'),now+130);
 s.ingest(trade('late',now+200),now+40001);
 const rows=s.drainTrades(now+40001);assert.equal(rows[0].buys,2);assert.equal(rows[0].streamContinuous,false);
 const status=s.status(now+40001);assert.equal(status.dedupIds,0);assert.equal(status.droppedTrades,1);assert.equal(status.lateTrades,1);
});
test('disconnect marks buffered trade coverage incomplete and never manufactures empty buckets',()=>{
 const s=fixture();s.ingest(trade('a'),now+110);s.disconnect(now+500);s.connect('c2',now+1000);
 const rows=s.drainTrades(now+40000);assert.equal(rows[0].streamContinuous,false);assert.deepEqual(s.drainTrades(now+50000),[]);
});
test('a drop before a bucket exists remains visible when capacity later recovers',()=>{
 const s=fixture({maxBucketsPerSymbol:1});s.ingest(trade('first',now+100),now+110);
 s.ingest(trade('dropped',now+10100),now+10110);assert.equal(s.status(now+10110).droppedTrades,1);
 s.drainTrades(now+40000);
 s.ingest(trade('recovered',now+19900),now+40001);
 const rows=s.drainTrades(now+50000);assert.equal(rows.length,1);assert.equal(rows[0].buys,1);assert.equal(rows[0].streamContinuous,false);
});
test('finalized trade IDs release capacity exactly at the late-data boundary',()=>{
 const s=fixture({dedupLimit:1});s.ingest(trade('old'),now+110);
 s.ingest(trade('dropped',now+10100),now+10110);
 assert.equal(s.status(now+10110).droppedTrades,1);
 // At +40s the old bucket can never accept another trade, even before a drain.
 s.ingest(trade('accepted',now+19900),now+40000);
 const rows=s.drainTrades(now+50000);assert.equal(rows.length,2);
 assert.equal(rows[1].buys,1);assert.equal(rows[1].streamContinuous,false);
 assert.equal(s.status(now+50000).droppedTrades,1);
 assert.equal(s.status(now+50000).dedupIds,0);
});
test('out-of-order event buckets expire independently without losing live duplicate protection',()=>{
 const s=fixture({dedupLimit:2});s.ingest(trade('new',now+20100),now+20110);
 s.ingest(trade('old',now+100),now+20120);
 s.ingest(trade('replacement',now+30100),now+40000);
 s.disconnect(now+40001);s.connect('c2',now+40002);
 s.ingest(trade('new',now+20100),now+40003);
 s.ingest(trade('old',now+100),now+40004);
 const rows=s.drainTrades(now+80000);
 assert.equal(rows.reduce((n,r)=>n+r.buys,0),3);
 assert.equal(s.status(now+80000).droppedTrades,0);
 assert.equal(s.status(now+80000).duplicateTrades,1);
 assert.equal(s.status(now+80000).lateTrades,1);
});
test('sustained traffic does not let finalized IDs starve live buckets',()=>{
 const s=fixture();let rows:ReturnType<MicrostructureState['drainTrades']>=[];
 for(let second=0;second<120;second++){
  const at=now+second*1000+100;
  const data=Array.from({length:1200},(_,i)=>({i:`${second}-${i}`,T:at,s:'BTCUSDT',S:'Buy',p:'100',v:'2'}));
  s.ingest({topic:'publicTrade.BTCUSDT',data},at);
  s.ingest({topic:'publicTrade.BTCUSDT',data:[data[0]]},at+1);
  if(second%10===0)rows.push(...s.drainTrades(at));
 }
 rows.push(...s.drainTrades(now+160000));
 assert.equal(rows.reduce((n,r)=>n+r.buys,0),144000);
 assert.equal(rows.every(r=>r.streamContinuous),true);
 assert.equal(s.status(now+160000).droppedTrades,0);
 assert.equal(s.status(now+160000).duplicateTrades,120);
 assert.equal(s.status(now+160000).dedupIds,0);
});
test('malformed prices and untrusted symbol/topic pairs are rejected without mutating book',()=>{
 const s=fixture();s.ingest(book(),now);s.ingest(book('delta',11,21,[['NaN','2']]),now+1);assert.deepEqual(s.sample(now+2),[]);
 s.ingest({...book(),data:{...book().data,s:'ETHUSDT'}},now+3);assert.deepEqual(s.sample(now+4),[]);
 assert.equal(s.status(now+4).invalidMessages>0,true);
});

test('observed-size burst fits default bound and exposes lifetime peak',()=>{
 const s=fixture();
 for(let batch=0;batch<40;batch++)s.ingest({topic:'publicTrade.BTCUSDT',data:Array.from({length:2000},(_,i)=>({i:`burst-${batch}-${i}`,T:now+100,s:'BTCUSDT',S:'Buy',p:'100',v:'1'}))},now+101);
 assert.equal(s.status(now+102).droppedTrades,0);
 assert.equal(s.status(now+102).peakDedupIds,80000);
 assert.equal(s.drainTrades(now+40000)[0].buys,80000);
 assert.equal(s.status(now+40000).peakDedupIds,80000);
});
test('loss reasons partition total and quiet symbols remain explicitly unobserved',()=>{
 const s=fixture({dedupLimit:1});
 assert.equal(s.status(now).tradeObservations[0].lastReceivedAt,null);
 s.ingest(trade('a'),now+110);s.ingest(trade('b'),now+120);
 assert.equal(s.status(now+121).dedupCapacityDrops,1);
 assert.equal(s.status(now+121).bucketCapacityDrops,0);
 assert.equal(s.status(now+121).tradeObservations[0].lastReceivedAt,now+120);
 const b=fixture({maxBucketsPerSymbol:1});b.ingest(trade('a'),now+110);b.ingest(trade('b',now+10100),now+10110);
 assert.equal(b.status(now+10111).bucketCapacityDrops,1);
 assert.equal(b.status(now+10111).dedupCapacityDrops,0);
});
