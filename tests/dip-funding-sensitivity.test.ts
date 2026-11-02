import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateDipFunding} from '../src/dip-funding-sensitivity.js';

const HOUR=3600000;
function sample(side='LONG'){
 const at=Date.parse('2026-10-31T00:00:00Z');
 return {id:1,side,entry_at:new Date(at).toISOString(),exit_at:new Date(at+12*HOUR).toISOString(),
  entry_price:100,exit_price:102,net_pnl:.18,
  candles:Array.from({length:60},(_,i)=>({time:new Date(at-(60-i)*60000).toISOString(),close:100*(1+i*.0001),volume:i<45?100:150}))};
}
const coverage={complete:true,requestedFrom:Date.parse('2026-10-30T00:00:00Z'),requestedTo:Date.parse('2026-11-02T00:00:00Z')};
const rate={funding_at:'2026-10-31T08:00:00Z',rate:'0.001'};
test('long pays and short receives observed positive funding under fixed-notional sensitivity',()=>{
 const long=estimateDipFunding([sample()], [rate], coverage);
 const short=estimateDipFunding([sample('SHORT')],[rate],coverage);
 assert.equal(long.status,'estimated_only');
 assert.equal(long.forwardHoldout?.independentBaseline.trades,1);
 assert.ok(Math.abs(long.forwardHoldout!.independentBaseline.estimatedFundingUsdt+.01)<1e-12);
 assert.ok(Math.abs(short.forwardHoldout!.independentBaseline.estimatedFundingUsdt-.01)<1e-12);
 assert.equal(long.forwardHoldout!.independentBaseline.settlementEvents,1);
});
test('missing provider coverage cannot be treated as zero funding',()=>{
 const x=estimateDipFunding([sample()],[],{complete:false,requestedFrom:coverage.requestedFrom,requestedTo:coverage.requestedTo});
 assert.equal(x.status,'incomplete_funding_history');
 assert.equal(x.forwardHoldout,null);
 assert.equal(x.coveredTrades,0);
});
test('funding history that starts after entry blocks net-after-funding metric',()=>{
 const x=estimateDipFunding([sample()],[rate],{...coverage,requestedFrom:Date.parse('2026-10-31T02:00:00Z')});
 assert.equal(x.status,'incomplete_trade_coverage');
 assert.equal(x.forwardHoldout,null);
});
test('settlement exactly at exit is ambiguous and not silently included or excluded',()=>{
 const x=estimateDipFunding([sample()],[{funding_at:'2026-10-31T12:00:00Z',rate:'0.001'}],coverage);
 assert.equal(x.boundaryAmbiguousTrades,1);
 assert.equal(x.forwardHoldout,null);
});
test('duplicate settlement rows invalidate the estimate',()=>{
 const x=estimateDipFunding([sample()],[rate,rate],coverage);
 assert.equal(x.status,'incomplete_funding_history');
 assert.equal(x.forwardHoldout,null);
});
test('duplicate trade entries are counted once',()=>{
 const x=estimateDipFunding([sample(),sample()],[rate],coverage);
 assert.equal(x.eligibleTrades,1);
 assert.equal(x.forwardHoldout?.independentBaseline.trades,1);
});
