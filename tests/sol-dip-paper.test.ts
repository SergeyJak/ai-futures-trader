import test from 'node:test';import assert from 'node:assert/strict';import {SOL_VARIANTS,dipSignal,exitDecision} from '../src/sol-dip-paper.js';
test('exactly three SOL exit modes',()=>{assert.deepEqual(SOL_VARIANTS.map(x=>x.minutes),[30,240,null])});
test('dip reversal requires a bounce after decline',()=>{assert.equal(dipSignal([{close:100},{close:99.8},{close:99.2},{close:99.5}]),true);assert.equal(dipSignal([{close:100},{close:99.8},{close:99.2},{close:99.1}]),false)});
test('stop wins when stop and take touched in same candle',()=>{assert.equal(exitDecision({entry:100,entryAt:0},{time:60000,high:103,low:98,close:100},null)?.reason,'STOP')});
test('30-minute and four-hour expiry differ, unlimited does not expire',()=>{const p={entry:100,entryAt:0},bar={time:31*60000,high:100.1,low:99.9,close:100};assert.equal(exitDecision(p,bar,30)?.reason,'TIME');assert.equal(exitDecision(p,bar,240),null);assert.equal(exitDecision(p,bar,null),null)});

test('entry signal uses the four latest completed candles, not the preceding window',()=>{const bars=[{close:100},{close:100},{close:99.8},{close:99.2},{close:99.5}];assert.equal(dipSignal(bars.slice(-5,-1)),false);assert.equal(dipSignal(bars.slice(-4)),true)});
