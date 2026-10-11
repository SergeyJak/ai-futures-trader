import test from 'node:test';
import assert from 'node:assert/strict';
import {v6Insights} from '../src/v6-insights.js';
test('open snapshots do not count as closed trades',()=>{const x=v6Insights([{trader_id:'T',kind:'history',raw:{closing_pnl:'10'}},{trader_id:'T',kind:'history',raw:{closing_pnl:'-5'}},{trader_id:'T',kind:'open',raw:{pnl:200}}]);assert.equal(x.historyRecords,2);assert.equal(x.openSnapshots,1);assert.equal(x.traders[0].profitFactor,2);assert.equal(x.traders[0].winRate,0.5);assert.equal(x.readyToTrade,false)});
