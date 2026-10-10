import test from 'node:test';
import assert from 'node:assert/strict';
import {marketHtml,analyticsHtml,researchHtml} from '../src/extra-pages.js';
test('market page renders candle svg engine and instrument controls without JSON dumps',()=>{assert.match(marketHtml,/candleChart/);assert.match(marketHtml,/candle-chart/);assert.match(marketHtml,/api\/candles\?/);assert.doesNotMatch(marketHtml,/JSON\.stringify\(data,null,2\)/)});
test('analytics page charts and table use backtest endpoints',()=>{assert.match(analyticsHtml,/backtest-chart/);assert.match(analyticsHtml,/barChart/);assert.match(analyticsHtml,/api\/backtest-compare/)});
test('research page charts use independent holdout',()=>{assert.match(researchHtml,/validation-chart/);assert.match(researchHtml,/training-chart/);assert.match(researchHtml,/api\/research/)});

test('market chart supports zoom pan and per-account trade overlays',()=>{for(const token of ['zoom-in','zoom-out','pan-left','pan-right','latest','entry_price','exit_price','Stop Loss','Take Profit','api/paper?account='])assert.ok(marketHtml.includes(token),token)});

test('mobile chart auto scales from candles and clips distant levels',()=>{assert.match(marketHtml,/candleHigh\+margin/);assert.match(marketHtml,/clampY\(price\)/);assert.match(marketHtml,/chart-controls/);assert.match(marketHtml,/pinchDistance/);assert.match(marketHtml,/touchmove/)});

test('trade summary and compact clipping labels appear on market chart',()=>{assert.match(marketHtml,/id="trade-summary"/);assert.match(marketHtml,/function tradeSummary/);assert.match(marketHtml,/draw\(p\.stop.*'SL'/);assert.match(marketHtml,/draw\(p\.take.*'TP'/);assert.match(marketHtml,/left===Infinity/)});
