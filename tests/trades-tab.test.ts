import test from 'node:test';
import assert from 'node:assert/strict';
import {backtest} from '../src/backtest.js';
import {dashboardHtml} from '../src/dashboard.js';
const data=Array.from({length:50},(_,i)=>({start_at:new Date(1760000000000+i*60000).toISOString(),open:'100',high:'101',low:'99',close:'100',volume:'10'}));
test('default capital is one hundred dollars',()=>{const result=backtest(data);assert.equal(result.initial,100);assert.equal(result.equity,100)});
test('trades have a separate tab in the dashboard',()=>{assert.match(dashboardHtml,/data-page="trades"/);assert.match(dashboardHtml,/id="trades-page"/);assert.match(dashboardHtml,/id="market-page"/);assert.match(dashboardHtml,/\$100 старт/)});
