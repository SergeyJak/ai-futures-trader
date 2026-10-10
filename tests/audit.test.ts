import test from 'node:test';import assert from 'node:assert/strict';import {auditTrade,auditSummary} from '../src/audit.js';
test('reconcile stored trade PnL and quantify fees and slippage',()=>{
 const t={id:'1',account_id:11,symbol:'SOLUSDT',side:'LONG',quantity:'0.2',entry_price:'100.02',exit_price:'101.9796',entry_at:'2026-10-10T07:00:00Z',exit_at:'2026-10-10T07:05:00Z',pnl:'0',reason:'TIME'};
 const bars=[{start_at:t.entry_at,open:'100',high:'100.1',low:'99.9',close:'100'},{start_at:t.exit_at,open:'102',high:'102.1',low:'101.9',close:'102'}];
 const r=auditTrade(t,bars);assert.equal(r.entryReferenceInRange,true);assert.equal(r.exitReferenceInRange,true);assert.ok(r.entryFee>0);assert.ok(r.exitFee>0);assert.ok(r.slippageCost>0);assert.ok(r.recomputedPnl>0);assert.equal(auditSummary([r]).trades,1);
});
test('missing candles and implausible exits are flagged without rewriting history',()=>{
 const t={id:'2',account_id:1,symbol:'ETHUSDT',side:'SHORT',quantity:'0.01',entry_price:'2500',exit_price:'2600',entry_at:'2026-10-10T07:00:00Z',exit_at:'2026-10-10T07:05:00Z',pnl:'-1',reason:'TIME'};
 const r=auditTrade(t,[]);assert.equal(r.entryBarFound,false);assert.equal(r.exitBarFound,false);assert.ok(Math.abs(r.delta)>0);
});
