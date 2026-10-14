import test from 'node:test';
import assert from 'node:assert/strict';
import {dipOosChart} from '../src/dip-oos.js';

test('closed OOS chart accepts numeric trade id',async()=>{
 let queries=0;
 const pool={query:async()=>{
  queries++;
  if(queries===1)return {rowCount:1,rows:[{id:'123',variant:'4h',side:'SHORT',entry_at:'2026-10-14T00:00:00Z',exit_at:'2026-10-14T00:30:00Z',entry_price:100,exit_price:99,reason:'TIME'}]};
  return {rows:[]};
 }};
 const result=await dipOosChart(pool as any,'4h','123');
 assert.equal(result?.trade.id,'123');
 assert.equal(queries,2);
});

test('closed OOS chart rejects nonnumeric id without querying database',async()=>{
 let queries=0;
 const pool={query:async()=>{queries++;return {rows:[]}}};
 assert.equal(await dipOosChart(pool as any,'4h','abc'),null);
 assert.equal(await dipOosChart(pool as any,'4h','1 OR 1=1'),null);
 assert.equal(queries,0);
});
