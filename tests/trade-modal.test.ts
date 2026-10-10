import test from 'node:test';import assert from 'node:assert/strict';import {dashboardHtml} from '../src/dashboard.js';import {readFileSync} from 'node:fs';
test('history rows can launch accessible trade candle modal',()=>{for(const text of ['trade-dialog','showModal()','openTrade(t)','drawTradeChart','api/trade-candles','entry_price','exit_price','trade-dialog-close'])assert.ok(dashboardHtml.includes(text),text)});
test('historical interval validates symbol and bounded duration on server',()=>{const source=readFileSync('src/index.ts','utf8');assert.match(source,/api\/trade-candles/);assert.match(source,/to-from>1440\*60000/);assert.match(source,/db\.candlesBetween/);});

test('trade chart SVG uses namespace and rejects parser errors',()=>{assert.match(dashboardHtml,/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);assert.match(dashboardHtml,/querySelector\('parsererror'\)/)});

test('open position supports chart modal and current quote with risk lines',()=>{for(const s of ['openCurrentPosition','active-position','trade-exit-key','Текущая цена','trade.stop','trade.take'])assert.ok(dashboardHtml.includes(s),s)});

test('mobile modal simplifies current quote and close control',()=>{assert.ok(dashboardHtml.includes('aria-label="Закрыть окно"'));assert.ok(dashboardHtml.includes('font-size="18" fill="#4c5e79"'));assert.ok(dashboardHtml.includes("el('trade-exit-key').hidden=true"));});
