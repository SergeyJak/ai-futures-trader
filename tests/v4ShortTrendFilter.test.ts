import test from 'node:test';
import assert from 'node:assert/strict';
import {shortDowntrendAtEntry} from '../src/research/v4ShortTrendFilter.js';
const origin=Date.parse('2026-10-15T12:00:00Z');
const bars=(prices:number[])=>prices.map((v,i)=>({start_at:new Date(origin+i*60000).toISOString(),close:String(v)}));
test('trend filter requires 60 completed contiguous minutes, never entry candle close',()=>{
 const falling=bars(Array.from({length:61},(_,i)=>100-i*.05));
 assert.equal(shortDowntrendAtEntry(falling),true);
 const changed=[...falling.slice(0,-1),{...falling.at(-1)!,close:'1000000'}];
 assert.equal(shortDowntrendAtEntry(changed),true);
 assert.equal(shortDowntrendAtEntry(falling.slice(1)),false);
 const gap=falling.map(x=>({...x}));gap[30].start_at=new Date(origin+31*60000).toISOString();
 assert.equal(shortDowntrendAtEntry(gap),false);
 const rising=bars(Array.from({length:61},(_,i)=>100+i*.05));
 assert.equal(shortDowntrendAtEntry(rising),false);
});
