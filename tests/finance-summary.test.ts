import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFinance} from '../src/finance-summary.js';

test('SOL finance uses full closed trade count, not limited recent history',()=>{
 const variants=[{id:'30m',balance:103,trades:12,closedTrades:130,wins:70},{id:'4h',balance:99,trades:9,closedTrades:45,wins:20}];
 const summary=summarizeFinance(variants);
 assert.equal(summary.closedTrades,175);
 assert.deepEqual(summary.rows.map(x=>x.trades),[130,45]);
 assert.equal(summary.net,2);
});

test('Other paper versions keep their own trade counts',()=>{
 const summary=summarizeFinance([{id:'v3',balance:97,trades:42,wins:12}]);
 assert.equal(summary.closedTrades,42);
 assert.equal(summary.rows[0].trades,42);
});
