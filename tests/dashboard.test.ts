import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHtml} from '../src/dashboard.js';
test('home prioritizes paper account and position with mobile viewport',()=>{assert.match(dashboardHtml,/name="viewport"/);assert.match(dashboardHtml,/id="balance"/);assert.match(dashboardHtml,/id="equity"/);assert.match(dashboardHtml,/id="active-position"/);assert.match(dashboardHtml,/id="trades"/)});
test('dashboard reads only simulated trades and escapes dynamic fields',()=>{assert.match(dashboardHtml,/\/api\/paper/);assert.match(dashboardHtml,/\/api\/candles/);assert.match(dashboardHtml,/textContent=/);assert.doesNotMatch(dashboardHtml,/innerHTML/)});
