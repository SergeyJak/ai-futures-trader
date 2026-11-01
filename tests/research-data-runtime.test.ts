import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ResearchDataRuntime,researchDataConfig} from '../src/research-data-runtime.js';
import type {MarketSample,TradeBucket,FundingSettlement} from '../src/research-data-store.js';
const epoch=Date.parse('2026-11-01T12:00:00Z');
class Socket extends EventEmitter{
 readyState=0;sent:string[]=[];
 send(value:string){this.sent.push(value)}
 open(){this.readyState=1;this.emit('open')}
 message(payload:unknown){this.emit('message',Buffer.from(JSON.stringify(payload)))}
 terminate(){if(this.readyState===3)return;this.readyState=3;this.emit('close')}
 close(){this.terminate()}
}
function fixture(env:NodeJS.ProcessEnv={}){
 let now=epoch;const sockets:Socket[]=[];const saved={samples:[] as MarketSample[][],trades:[] as TradeBucket[][],funding:[] as FundingSettlement[][],events:[] as string[]};
 const sink={async init(){saved.events.push('init')},async writeSamples(rows:MarketSample[]){saved.samples.push(rows)},async writeTradeBuckets(rows:TradeBucket[]){saved.trades.push(rows)},async writeFunding(rows:FundingSettlement[]){saved.funding.push(rows)},async saveStatus(){saved.events.push('status')},async prune(){saved.events.push('prune')}};
 const config=researchDataConfig(env,['BTCUSDT'],'wss://stream.bybit.com/v5/public/linear');
 const deps={socketFactory:()=>{const s=new Socket();sockets.push(s);return s},now:()=>now,fetcher:async()=>new Response(JSON.stringify({retCode:0,result:{list:[]}})),closeStore:async()=>{saved.events.push('closed')}};
 return {config,sink,saved,sockets,deps,setNow:(value:number)=>{now=value}};
}
function sendBook(s:Socket,time=epoch){s.message({topic:'orderbook.50.BTCUSDT',type:'snapshot',ts:time,data:{s:'BTCUSDT',u:10,seq:20,b:[['100','2']],a:[['101','2']]}})}

test('runtime subscribes only public research topics and persists fresh samples',async t=>{
 const f=fixture(),r=new ResearchDataRuntime(f.config,f.sink,f.deps);t.after(()=>r.stop());await r.start();const s=f.sockets[0];s.open();
 const args=JSON.parse(s.sent[0]).args;assert.deepEqual(args,['orderbook.50.BTCUSDT','publicTrade.BTCUSDT','tickers.BTCUSDT']);assert.ok(!/auth|order\.create/.test(s.sent.join(' ')));
 sendBook(s);await r.flush();assert.equal(f.saved.samples[0][0].bid,100);assert.equal(r.status.storageReady,true);
});
test('a disabled collector neither creates tables nor connects or requests funding',async()=>{
 const f=fixture({RESEARCH_DATA_ENABLED:'false'}),r=new ResearchDataRuntime(f.config,f.sink,f.deps);await r.start();assert.equal(f.sockets.length,0);assert.deepEqual(f.saved.events,[]);assert.equal(r.status.enabled,false);await r.stop();
});
test('persistence overlap is single flight rather than an unbounded promise queue',async t=>{
 const f=fixture();let release!:()=>void;let count=0;const gate=new Promise<void>(resolve=>{release=resolve});f.sink.writeSamples=async rows=>{count++;await gate;f.saved.samples.push(rows)};
 const r=new ResearchDataRuntime(f.config,f.sink,f.deps);t.after(()=>r.stop());await r.start();f.sockets[0].open();sendBook(f.sockets[0]);
 const first=r.flush(),second=r.flush();await Promise.resolve();assert.equal(count,1);assert.equal(r.status.skippedFlushes,1);release();await Promise.all([first,second]);assert.equal(count,1);
});
test('a failed finalized trade batch is retried unchanged without additive duplicate volume',async t=>{
 const f=fixture();let fail=true;const attempts:TradeBucket[][]=[];f.sink.writeTradeBuckets=async rows=>{attempts.push(structuredClone(rows));if(fail&&rows.length){fail=false;throw Error('database unavailable')}};
 const r=new ResearchDataRuntime(f.config,f.sink,f.deps);t.after(()=>r.stop());await r.start();const s=f.sockets[0];s.open();sendBook(s);
 s.message({topic:'publicTrade.BTCUSDT',data:[{i:'a',T:epoch+10,s:'BTCUSDT',S:'Buy',p:'100',v:'2'}]});f.setNow(epoch+40000);await r.flush();await r.flush();
 const nonempty=attempts.filter(x=>x.length);assert.equal(nonempty.length,2);assert.deepEqual(nonempty[0],nonempty[1]);assert.equal(nonempty[1][0].buys,1);assert.equal(r.status.pendingRows,0);
});
test('provider block creates a one-hour cooldown rather than repeated funding requests',async t=>{
 const f=fixture();let calls=0;f.deps.fetcher=async()=>{calls++;return new Response('',{status:403})};
 const r=new ResearchDataRuntime(f.config,f.sink,f.deps);t.after(()=>r.stop());await r.start();await r.fundingOnce();await r.fundingOnce();assert.equal(calls,1);assert.equal(r.status.fundingRetryAt,epoch+3600000);
 f.setNow(epoch+3600001);await r.fundingOnce();assert.equal(calls,2);
});
test('stop aborts funding, terminates socket, and closes the research pool only after tasks drain',async()=>{
 const f=fixture();let aborted=false;
 f.deps.fetcher=async(_url?:unknown,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>{aborted=true;reject(init.signal?.reason)},{once:true})});
 const r=new ResearchDataRuntime(f.config,f.sink,f.deps);await r.start();f.sockets[0].open();await r.stop();
 assert.equal(aborted,true);assert.equal(f.sockets[0].readyState,3);assert.equal(f.saved.events.at(-1),'closed');assert.equal(r.status.stopped,true);
});
test('configuration bounds public endpoints, retention and explicitly assumed fee rates',()=>{
 assert.throws(()=>researchDataConfig({RESEARCH_DATA_RETENTION_DAYS:'0'},['BTCUSDT'],'wss://stream.bybit.com/v5/public/linear'),/retention/i);
 assert.throws(()=>researchDataConfig({},['BTCUSDT'],'wss://stream.bybit.com/v5/private'),/public/i);
 const c=researchDataConfig({},['BTCUSDT'],'wss://stream.bybit.com/v5/public/linear');assert.equal(c.takerFeeRate,.0006);assert.equal(c.makerFeeRate,.0002);
});
test('shutdown explicitly accounts for a failed pending persistence batch',async()=>{
 const f=fixture();f.sink.writeSamples=async()=>{throw Error('offline')};
 const r=new ResearchDataRuntime(f.config,f.sink,f.deps);await r.start();f.sockets[0].open();sendBook(f.sockets[0]);await r.flush();
 assert.equal(r.status.pendingRows,1);await r.stop();assert.equal(r.status.pendingRows,0);assert.equal(r.status.droppedPersistenceRows,1);
});
test('a schema initialization completing after stop cannot restart collection',async()=>{
 const f=fixture();let release!:()=>void;f.sink.init=()=>new Promise<void>(resolve=>{release=resolve});
 const r=new ResearchDataRuntime(f.config,f.sink,f.deps);const starting=r.start();await r.stop();release();await starting;
 assert.equal(r.status.stopped,true);assert.equal(r.status.storageReady,false);assert.equal(f.sockets.length,0);
});
