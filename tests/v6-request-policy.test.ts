import test from 'node:test';
import assert from 'node:assert/strict';
import {pauseForRetryAfter,rotateResearchSample,MIN_PAUSE_MS} from '../src/v6-request-policy.js';

test('retry-after respects a conservative pause and a twelve-hour ceiling',()=>{
 assert.equal(pauseForRetryAfter(null),MIN_PAUSE_MS);
 assert.equal(pauseForRetryAfter('30'),MIN_PAUSE_MS);
 assert.equal(pauseForRetryAfter('10800'),10800000);
 assert.equal(pauseForRetryAfter('999999'),43200000);
 const now=Date.parse('2026-10-11T10:00:00Z');
 assert.equal(pauseForRetryAfter('Sun, 11 Oct 2026 14:00:00 GMT',now),14400000);
});
test('two-trader hourly sample covers twenty traders in ten hours',()=>{
 const ids=Array.from({length:20},(_,i)=>String(i));
 const visited=new Set<string>();
 for(let h=0;h<10;h++)for(const id of rotateResearchSample(ids,h*3600000))visited.add(id);
 assert.equal(visited.size,20);
 assert.deepEqual(rotateResearchSample([]),[]);
});
