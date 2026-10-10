import test from 'node:test';
import assert from 'node:assert/strict';
import {backtest} from '../src/backtest.js';
const rows=Array.from({length:45},(_,i)=>({start_at:new Date(1700000000000+i*60000).toISOString(),open:'100',high:'101',low:'99',close:'100',volume:'10'}));
for(const strategy of ['momentum','trend','reversal'] as const){test(strategy,()=>{const result=backtest(rows,1000,strategy);assert.equal(result.strategy,strategy);assert.equal(result.equity,1000);assert.equal(result.trades,0)})}
