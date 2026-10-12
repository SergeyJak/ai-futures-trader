import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {recordOutbound,outboundSnapshot} from '../src/outbound-telemetry.js';
test('counts provider requests and 429 separately',()=>{
 const at=Date.parse('2026-10-12T05:00:00Z');
 recordOutbound('api.bybit.com','/v5/market/kline',200,'collector',at);
 recordOutbound('api.bybit.com','/v5/market/kline',429,'collector',at);
 const row=outboundSnapshot().find(x=>x.minute==='2026-10-12T05:00'&&x.path==='/v5/market/kline');
 assert.equal(row?.requests,2);
 assert.equal(row?.rateLimited,1);
 assert.equal(row?.errors,1);
});
