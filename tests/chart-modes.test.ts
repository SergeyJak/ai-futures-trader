import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHtml} from '../src/dashboard.js';
test('line and candlestick view controls are available',()=>{
 assert.match(dashboardHtml,/data-mode="line"/);
 assert.match(dashboardHtml,/data-mode="candles"/);
 assert.match(dashboardHtml,/id="candle-bars"/);
 assert.match(dashboardHtml,/Number\(r\.high\)/);
 assert.match(dashboardHtml,/Number\(r\.low\)/);
});
test('chart has all timeframes with aggregation',()=>{
 for(const value of [60,360,1440])assert.ok(dashboardHtml.includes('data-period="'+value+'"'));
 assert.match(dashboardHtml,/function aggregate/);
});
