import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sol=readFileSync(new URL('../src/sol-dip-paper.ts',import.meta.url),'utf8');
const v7=readFileSync(new URL('../src/v7.ts',import.meta.url),'utf8');
test('SOL queues entry and never fills on signal candle close',()=>{
 assert.match(sol,/pendingAt:bar.time\+60000/);
 assert.match(sol,/bar.time===pending.pendingAt/);
 assert.match(sol,/entry=bar.open\*\(1\+slip\)/);
 assert.doesNotMatch(sol,/entry=bar.close\*\(1\+slip\)/);
});
test('V7 queues next contiguous five-minute entry and uses next open',()=>{
 assert.match(v7,/pendingAt:bar.time\+300000/);
 assert.match(v7,/bar.time===pending.pendingAt/);
 assert.match(v7,/entry=bar.open\*\(1\+dir\*V7_COST.slippage\)/);
 assert.doesNotMatch(v7,/entry=bar.close\*\(1\+dir\*V7_COST.slippage\)/);
});
