import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPERIMENTS,entryDirection,microQuantity} from '../src/experiments.js';
import {dashboardHtml} from '../src/dashboard.js';
test('ten experimental accounts have unique identifiers and different setups',()=>{
 assert.deepEqual(EXPERIMENTS.map(x=>x.id),[2,3,4,5,6,11,7,8,9,10]);
 assert.equal(new Set(EXPERIMENTS.map(x=>x.name)).size,10);
 for(const a of EXPERIMENTS){assert.ok(a.maxUsd<=100&&a.maxUsd>0);assert.ok(a.maxMinutes>0);assert.ok(a.stop>0&&a.take>a.stop)}
});
test('micro account is capped at five dollars and five minutes',()=>{const a=EXPERIMENTS.find(x=>x.id===6);assert.equal(a?.maxUsd,5);assert.equal(a?.maxMinutes,5)});
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

test('five-dollar margin with 5x caps micro trade to 25 USD',()=>{const qty=microQuantity('SOLUSDT',110,100);assert.equal(qty,0.2);assert.ok(qty*110<=25);assert.ok(qty*110/5<=5)});
test('micro trade cannot exceed 5x or minimum step',()=>{assert.equal(microQuantity('SOLUSDT',110,100,5,6),0);assert.equal(microQuantity('SOLUSDT',400,100),0);assert.equal(microQuantity('ETHUSDT',2500,100),0.01)});

test('inactive position hidden and account switch clears stale card',()=>{assert.match(dashboardHtml,/\[hidden\]\{display:none!important\}/);assert.match(dashboardHtml,/function chooseAccount\(id\).*active-position.*hidden=true/)});

test('new accounts preserve prior six and add research candidates',()=>{assert.deepEqual(EXPERIMENTS.filter(x=>x.id>=7&&x.id<=10).map(x=>x.strategy),['squeeze','regime','sweep','quarter']);for(const x of EXPERIMENTS.filter(x=>x.id>=7)){assert.equal(x.maxUsd<=100,true)}});
test('all navigation links restored',()=>{for(const route of ['/analytics','/market','/research'])assert.ok(dashboardHtml.includes('href="'+route+'"'))});
