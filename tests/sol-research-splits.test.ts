import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSolHistory,SOL_SPLIT_DATES} from '../src/sol-research-splits.js';
import type {Bar} from '../src/sol-recovery-breakout.js';
const bar=(time:number):Bar=>({time,open:100,high:101,low:99,close:100,volume:10});
test('frozen UTC boundaries never move when new bars arrive',()=>{
 const x=[bar(SOL_SPLIT_DATES.discoveryEnd-60000),bar(SOL_SPLIT_DATES.discoveryEnd),bar(SOL_SPLIT_DATES.validationEnd),bar(SOL_SPLIT_DATES.forwardStart)];
 const before=splitSolHistory(x);assert.deepEqual(before.map(s=>s.length),[1,1,1,1]);
 const after=splitSolHistory([...x,bar(SOL_SPLIT_DATES.forwardStart+60000)]);
 assert.deepEqual(after.map(s=>s.length),[1,1,1,2]);
});
