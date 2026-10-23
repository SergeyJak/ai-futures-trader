import test from 'node:test';import assert from 'node:assert/strict';import {SOL_VARIANTS,dipSignal,exitDecision,solPaperReport,confirmedCandleCloseTime,openSolDipPosition} from '../src/sol-dip-paper.js';
test('exactly three SOL exit modes',()=>{assert.deepEqual(SOL_VARIANTS.map(x=>x.minutes),[30,240,null])});
test('dip reversal requires a bounce after decline',()=>{assert.equal(dipSignal([{close:100},{close:99.8},{close:99.2},{close:99.5}]),true);assert.equal(dipSignal([{close:100},{close:99.8},{close:99.2},{close:99.1}]),false)});
test('stop wins when stop and take touched in same candle',()=>{assert.equal(exitDecision({entry:100,entryAt:0},{time:60000,high:103,low:98,close:100},null)?.reason,'STOP')});
test('30-minute and four-hour expiry differ, unlimited does not expire',()=>{const p={entry:100,entryAt:0},bar={time:31*60000,high:100.1,low:99.9,close:100};assert.equal(exitDecision(p,bar,30)?.reason,'TIME');assert.equal(exitDecision(p,bar,240),null);assert.equal(exitDecision(p,bar,null),null)});

test('entry signal uses the four latest completed candles, not the preceding window',()=>{const bars=[{close:100},{close:100},{close:99.8},{close:99.2},{close:99.5}];assert.equal(dipSignal(bars.slice(-5,-1)),false);assert.equal(dipSignal(bars.slice(-4)),true)});

test('SOL summary uses all-time aggregate, not limited recent trade rows',async()=>{
 const calls:string[]=[];
 const pool={query:async(sql:string)=>{
  calls.push(sql);
  if(sql.includes('FROM sol_dip_accounts'))return {rows:[{id:'30m',balance:101,position:null}]};
  if(sql.includes('FROM sol_dip_trades GROUP BY variant'))return {rows:[{variant:'30m',closed_trades:125,realized_net_pnl:1,wins:70}]};
  if(sql.includes('ROW_NUMBER() OVER (PARTITION BY variant'))return {rows:[{variant:'30m',net_pnl:.01}]};
  return {rows:[{checked:10,signals:1,latest:null}]};
 }};
 const result=await solPaperReport(pool as never);
 const variant=result.variants.find(v=>v.id==='30m');
 assert.equal(variant?.closedTrades,125);
 assert.equal(variant?.realizedNetPnl,1);
 assert.equal(variant?.wins,70);
 assert.equal(variant?.trades.length,1);
 assert.ok(calls.some(sql=>sql.includes('GROUP BY variant')));
 assert.ok(calls.some(sql=>sql.includes('ROW_NUMBER() OVER (PARTITION BY variant ORDER BY id DESC)')&&sql.includes('variant_rank<=60')));
});

test('SOL 1m LONG enters at next minute open, not its close',()=>{
 const time=Date.parse('2026-10-18T05:00:00Z');
 const p=openSolDipPosition({time,open:100},100);
 assert.equal(p.entryAt,time);
 assert.equal(p.entry,100.03);
 assert.ok(p.quantity>0);
 assert.equal(confirmedCandleCloseTime(time),time+60000);
});
