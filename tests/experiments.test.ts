import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPERIMENTS,entryDirection} from '../src/experiments.js';
import {dashboardHtml} from '../src/dashboard.js';
test('four new experimental accounts have unique identifiers and different setups',()=>{
 assert.deepEqual(EXPERIMENTS.map(x=>x.id),[2,3,4,5]);
 assert.equal(new Set(EXPERIMENTS.map(x=>x.name)).size,4);
 for(const a of EXPERIMENTS){assert.ok(a.maxUsd<=100&&a.maxUsd>0);assert.ok(a.maxMinutes>0);assert.ok(a.stop>0&&a.take>a.stop)}
});
test('strategy refuses to enter with insufficient candles',()=>{
 assert.equal(entryDirection([],'momentum'),null);
 assert.equal(entryDirection([],'trend'),null);
 assert.equal(entryDirection([],'reversal'),null);
});
test('home exposes account switching and independent paper status',()=>{
 assert.match(dashboardHtml,/account-tabs/);
 assert.match(dashboardHtml,/account-comparison/);
 assert.match(dashboardHtml,/api\/paper-accounts/);
 assert.match(dashboardHtml,/api\/paper\?account=/);
});
