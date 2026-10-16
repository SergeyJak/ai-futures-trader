import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFinance} from '../src/finance-summary.js';
test('summary preserves sample counts',()=>{
 const result=summarizeFinance([{balance:99,trades:20,wins:9,fees:1,max_drawdown_closed:0.05}]);
 assert.equal(result.accounts,1);
 assert.equal(result.positive,0);
 assert.equal(result.closedTrades,20);
 assert.equal(result.maxClosedDrawdown,0.05);
});
