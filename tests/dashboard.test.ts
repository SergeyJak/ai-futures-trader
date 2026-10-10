import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHtml} from '../src/dashboard.js';
test('dashboard has responsive viewport and monitored symbols',()=>{
 assert.match(dashboardHtml,/name="viewport"/);
 for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT'])assert.ok(dashboardHtml.includes(symbol));
});
test('dashboard uses read-only APIs and escapes dynamic content via textContent',()=>{
 assert.match(dashboardHtml,/\/api\/overview/);
 assert.match(dashboardHtml,/\/api\/candles/);
 assert.match(dashboardHtml,/textContent=/);
 assert.doesNotMatch(dashboardHtml,/innerHTML/);
});
