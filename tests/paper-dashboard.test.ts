import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHtml} from '../src/dashboard.js';
test('paper UI stays separate and is read only',()=>{assert.match(dashboardHtml,/Paper Trading/);assert.match(dashboardHtml,/id="paper-journal"/);assert.match(dashboardHtml,/\/api\/paper/);assert.doesNotMatch(dashboardHtml,/\/api\/paper\/place-order/)});
