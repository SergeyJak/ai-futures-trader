import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHtml} from '../src/dashboard.js';
test('paper UI is main page and read-only',()=>{assert.match(dashboardHtml,/Paper Trading/);assert.match(dashboardHtml,/id="trades"/);assert.match(dashboardHtml,/\/api\/paper/);assert.doesNotMatch(dashboardHtml,/\/api\/paper\/place-order/)});
