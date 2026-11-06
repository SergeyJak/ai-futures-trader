import test from 'node:test';import assert from 'node:assert/strict';
import {unifiedHeader} from '../src/unified-header.js';
import {uiResponse} from '../src/ui-routes.js';
test('menu contains only current test and collector coverage',()=>{
 assert.deepEqual([...unifiedHeader.matchAll(/<nav[^>]*>(.*?)<\/nav>/gs)].length,1);
 assert.doesNotMatch(unifiedHeader,/Архив|V[1-8]|research-progress|finance|strategy\//);
 assert.match(unifiedHeader,/Состояние данных/);
});
test('home no longer loads old rankings and finance summaries',()=>{
 const home=uiResponse('GET','/')!.body;
 assert.match(home,/api\/relative-strength/);
 assert.doesNotMatch(home,/api\/finance|api\/overview|api\/v[1-8]/);
});
