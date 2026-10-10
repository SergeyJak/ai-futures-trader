import test from 'node:test';
import assert from 'node:assert/strict';
import {marketHtml,analyticsHtml,researchHtml} from '../src/extra-pages.js';
test('market page renders candle svg engine and instrument controls without JSON dumps',()=>{assert.match(marketHtml,/candleChart/);assert.match(marketHtml,/candle-chart/);assert.match(marketHtml,/api\/candles\?/);assert.doesNotMatch(marketHtml,/JSON\.stringify\(data,null,2\)/)});
test('analytics page charts and table use backtest endpoints',()=>{assert.match(analyticsHtml,/backtest-chart/);assert.match(analyticsHtml,/barChart/);assert.match(analyticsHtml,/api\/backtest-compare/)});
test('research page charts use independent holdout',()=>{assert.match(researchHtml,/validation-chart/);assert.match(researchHtml,/training-chart/);assert.match(researchHtml,/api\/research/)});
