import test from 'node:test';import assert from 'node:assert/strict';
import {createResearchProgress} from '../src/research-progress.js';
import {researchProgressHtml} from '../src/research-progress-page.js';
test('research progress is read-only, caches its report and uses complete UTC holdout',async()=>{
 let clock=Date.parse('2026-10-16T18:00:00Z'),connects=0;const sql:string[]=[];
 const client={query:async(q:string)=>{sql.push(q);return {rows:[]}},release:()=>{}};
 const pool={connect:async()=>{connects++;return client}} as any;
 const progress=createResearchProgress(pool,()=>clock);
 assert.equal(progress.snapshot().state,'pending');
 const first=await progress.run();
 assert.equal(first.state,'ready');assert.equal(first.cutoff,'2026-10-08T00:00:00.000Z');
 assert.deepEqual(first.studies.map(s=>s.version),['v4']);assert.equal(first.studies[0].result?.loadedTrades,0);
 assert.equal(sql.filter(q=>q==='BEGIN READ ONLY').length,1);
 assert.equal(connects,1);assert.equal(sql[0],'BEGIN READ ONLY');assert.equal(sql.at(-1),'ROLLBACK');
 await progress.run();assert.equal(connects,1);
 clock+=6*3600000+1;await progress.run();assert.equal(connects,2);
 assert.equal(sql.filter(q=>q==='BEGIN READ ONLY').length,2);
});
test('research page renders data API and progress milestones',()=>{
 assert.match(researchProgressHtml,/\/api\/research-progress/);
 assert.match(researchProgressHtml,/Дорожная карта/);
 assert.match(researchProgressHtml,/candidate-for-paper/);
 assert.doesNotMatch(researchProgressHtml,/V3|\['v3','v4'\]|id="v3"/);
 assert.match(researchProgressHtml,/Результаты фильтров V4/);
});
