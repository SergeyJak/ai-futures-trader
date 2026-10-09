import test from 'node:test';import assert from 'node:assert/strict';import {parseCandle} from '../src/candles.js';
const allowed=new Set(['BTCUSDT']);const m={topic:'kline.1.BTCUSDT',data:[{start:1735689600000,open:'100',high:'103',low:'99',close:'101',volume:'12.5',turnover:'1262',confirm:true}]};
test('parses candle without floating point',()=>{const c=parseCandle(m,allowed);assert.equal(c.length,1);assert.equal(c[0].close,'101');assert.equal(c[0].confirmed,true)});
test('ignores untracked symbol',()=>assert.deepEqual(parseCandle({...m,topic:'kline.1.XRPUSDT'},allowed),[]));
test('ignores heartbeats',()=>assert.deepEqual(parseCandle({op:'pong'},allowed),[]));
test('rejects malformed price',()=>assert.throws(()=>parseCandle({...m,data:[{...m.data[0],open:'oops'}]},allowed)));
