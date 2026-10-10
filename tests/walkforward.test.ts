import test from 'node:test';
import assert from 'node:assert/strict';
import {walkForward,validateHistory} from '../src/walkforward.js';
const base=Date.parse('2026-10-01T00:00:00Z');
const rows=Array.from({length:100},(_,i)=>({start_at:new Date(base+i*60000).toISOString(),open:'100',high:'101',low:'99',close:'100',volume:'10'}));
test('chronological split is 70/30',()=>{const result=walkForward(rows,'momentum');assert.equal(result.training.bars,70);assert.equal(result.validation.bars,30);assert.equal(result.splitAt,rows[70].start_at)});
test('detects historical gaps',()=>{const copy=rows.filter((_,i)=>i!==20);assert.equal(validateHistory(copy).gaps,1);assert.equal(walkForward(copy,'trend').preliminary,true)});
test('rejects reversed candles',()=>assert.throws(()=>validateHistory([rows[1],rows[0]])));
