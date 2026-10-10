import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardHtml} from '../src/dashboard.js';
test('homepage foregrounds the live paper position instead of charts',()=>{
 assert.match(dashboardHtml,/id="active-position"/);
 assert.match(dashboardHtml,/id="position-entry"/);
 assert.match(dashboardHtml,/id="position-pnl"/);
 assert.doesNotMatch(dashboardHtml,/id="plot"/);
});
test('paper trade history is visible on main page',()=>{
 assert.match(dashboardHtml,/id="trades"/);
 assert.match(dashboardHtml,/Завершённые сделки/);
 assert.match(dashboardHtml,/id="balance"/);
 assert.match(dashboardHtml,/id="equity"/);
});
