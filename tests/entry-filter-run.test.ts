import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('OOS runner pins read-only transaction and study queries to same connection',()=>{
 const src=readFileSync(new URL('../src/entry-filter-run.ts',import.meta.url),'utf8');
 assert.match(src,/client=await pool\.connect\(\)/);
 assert.match(src,/client\.query\('BEGIN READ ONLY'\)/);
 assert.match(src,/evaluateStoredEntryFilters\(client,version,cutoff,minTest\)/);
 assert.match(src,/client\.query\('ROLLBACK'\)/);
 assert.match(src,/client\?\.release\(\)/);
 assert.doesNotMatch(src,/pool\.query\(/);
});
