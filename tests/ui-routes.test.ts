import test from 'node:test';
import assert from 'node:assert/strict';
import {uiResponse} from '../src/ui-routes.js';
test('home is the current test and navigation exposes only test and data',()=>{
 const r=uiResponse('GET','/?source=bookmark')!;assert.equal(r.status,200);assert.match(r.body,/Относительная сила/);
 const nav=r.body.match(/<nav[^>]*>(.*?)<\/nav>/s)![1];assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/','/data-status']);
});
test('retired screens redirect even with query strings; APIs remain untouched',()=>{
 for(const path of ['/v8','/finance','/strategy/dip_reversal','/research-progress','/market','/dashboard']){const r=uiResponse('GET',path+'/?old=1')!;assert.equal(r.status,302);assert.equal(r.headers.location,'/')}
 assert.equal(uiResponse('GET','/api/v8-paper'),null);assert.equal(uiResponse('GET','/unknown'),null);
});
test('page routing handles methods and data status without legacy strategies',()=>{
 assert.equal(uiResponse('POST','/')!.status,405);assert.equal(uiResponse('HEAD','/')!.body,'');
 assert.match(uiResponse('GET','/data-status')!.body,/api\/research-data/);
});
