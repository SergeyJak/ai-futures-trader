import test from 'node:test';import assert from 'node:assert/strict';import {evaluateStoredEntryFilters} from '../src/entry-filter-stored.js';
test('fixed OOS study refuses silently truncated datasets',async()=>{
 const pool={query:async(sql:string)=>{assert.match(sql,/entry_at < \$1::timestamptz \+ interval '7 days'/);return {rows:Array.from({length:20001},()=>({}))};}} as any;
 await assert.rejects(()=>evaluateStoredEntryFilters(pool,'v3','2026-10-05T00:00:00Z'),/exceeds 20000/);
});
test('fixed OOS study exposes explicit start and end',async()=>{
 const pool={query:async()=>({rows:[]})} as any;
 const r=await evaluateStoredEntryFilters(pool,'v4','2026-10-05T00:00:00Z');
 assert.equal(r.studyStart,'2026-09-05T00:00:00.000Z');assert.equal(r.studyEnd,'2026-10-12T00:00:00.000Z');
});

test('fixed OOS refuses a partial seven-day holdout and never queries DB',async()=>{
 let queries=0;const pool={query:async()=>{queries++;return {rows:[]}}} as any;
 const recent=new Date(Date.now()-6*86400000).toISOString();
 await assert.rejects(()=>evaluateStoredEntryFilters(pool,'v3',recent),/holdout window is incomplete/);
 assert.equal(queries,0);
});
