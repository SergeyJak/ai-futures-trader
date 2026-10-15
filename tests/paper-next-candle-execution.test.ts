import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sol=readFileSync(new URL('../src/sol-dip-paper.ts',import.meta.url),'utf8');
const v7=readFileSync(new URL('../src/v7.ts',import.meta.url),'utf8');
test('SOL fills queued signal only on a subsequently observed confirmed bar',()=>{
 assert.match(sol,/pendingAt:bar.time\+60000/);
 assert.match(sol,/bar.time===pending.pendingAt/);
 assert.match(sol,/observedAt=Date.now\(\),entry=bar.close\*\(1\+slip\)/);
 assert.match(sol,/entryAt:observedAt/);
 assert.match(sol,/bar.time\+60000<=position.entryAt\?null:exitDecision/);
 assert.doesNotMatch(sol,/entry=bar.open\*\(1\+slip\)/);
});
test('V7 records observed entry time and does not replay prior intrabar extremes',()=>{
 assert.match(v7,/pendingAt:bar.time\+300000/);
 assert.match(v7,/bar.time===pending.pendingAt/);
 assert.match(v7,/observedAt=Date.now\(\),dir=/);
 assert.match(v7,/entry=bar.close\*\(1\+dir\*V7_COST.slippage\)/);
 assert.match(v7,/entryAt:observedAt/);
 assert.match(v7,/position.entryAt>=bar.time\+300000/);
 assert.doesNotMatch(v7,/entry=bar.open\*\(1\+dir\*V7_COST.slippage\)/);
});
