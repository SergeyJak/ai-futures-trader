import {test} from 'node:test';
import assert from 'node:assert/strict';
import {researchDataResponse} from '../src/research-data-api.js';
import {researchDataConfig} from '../src/research-data-runtime.js';
const now=Date.parse('2026-11-01T12:00:00Z');
const config=researchDataConfig({},['BTCUSDT'],'wss://stream.bybit.com/v5/public/linear');
function fixture(){const calls:string[]=[];return {calls,store:{async report(){calls.push('report');return {samples:[],trades:[],funding:[],status:[],fundingCashFlowVerified:false,feeRatesVerified:false,limitations:['Missing data are not zero cost.']}},async samples(){calls.push('samples');return []},async funding(){calls.push('funding');return []},async tradeHistory(){calls.push('trades');return []}}}}
test('research coverage endpoint states assumed fees and missing evidence without collecting data',async()=>{
 const f=fixture();const r=await researchDataResponse('GET','/api/research-data',f.store,config,{storageReady:true},now);
 assert.equal(r.status,200);assert.deepEqual(f.calls,['report']);const body=r.body as any;assert.equal(body.feeAssumptions.verified,false);assert.equal(body.feeAssumptions.takerRate,.0006);assert.deepEqual(body.samples,[]);
});
test('history validation rejects unsupported symbols, reversed ranges and oversized windows before any database call',async()=>{
 const f=fixture();
 for(const url of ['/api/research-data/samples?symbol=ETHUSDT','/api/research-data/samples?symbol=BTCUSDT&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z','/api/research-data/funding?symbol=BTCUSDT&from=2026-11-01T01:00:00Z&to=2026-11-01T00:00:00Z'])assert.equal((await researchDataResponse('GET',url,f.store,config,{},now)).status,400);
 assert.deepEqual(f.calls,[]);
});
test('bounded read routes expose truncation limits and reject methods without writing or starting work',async()=>{
 const f=fixture();for(const resource of ['samples','trades','funding']){const r=await researchDataResponse('GET','/api/research-data/'+resource+'?symbol=BTCUSDT',f.store,config,{},now);assert.equal(r.status,200);assert.equal((r.body as any).rowLimit,1500)}
 const count=f.calls.length;assert.equal((await researchDataResponse('POST','/api/research-data',f.store,config,{},now)).status,405);assert.equal(f.calls.length,count);
 assert.equal((await researchDataResponse('GET','/api/research-data/unknown',f.store,config,{},now)).status,404);
});
test('database failures stay explicit and do not leak connection details or invent empty successful history',async()=>{
 const f=fixture();f.store.samples=async()=>{throw Error('sensitive connection detail')};
 const r=await researchDataResponse('GET','/api/research-data/samples?symbol=BTCUSDT',f.store,config,{},now);assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('sensitive'));
});
