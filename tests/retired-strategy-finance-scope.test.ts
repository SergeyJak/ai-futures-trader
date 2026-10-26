import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overviewHtml} from '../src/overview-page.js';
import {financePageHtml} from '../src/finance-page.js';

test('routine finance endpoint excludes retired strategy without touching its collector or historical endpoint',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const begin=source.indexOf("if(req.url==='/api/finance')");
 const end=source.indexOf("if(req.url==='/api/v5')",begin);
 assert.ok(begin>=0&&end>begin);
 const finance=source.slice(begin,end);
 assert.doesNotMatch(finance,/db\.v3Report\s*\(/);
 assert.doesNotMatch(finance,/v3\s*:/);
 assert.match(finance,/db\.v4Report\s*\(/);
 assert.match(finance,/solPaperReport\s*\(/);
 assert.match(source,/if\(req\.url==='\/api\/v3'\)/);
 assert.match(source,/async function runIndependentV3\s*\(/);
 assert.match(source,/const v3Timer\s*=\s*setInterval/);
});

test('finance and overview ignore retired strategy even with stale API payloads',()=>{
 for(const html of [overviewHtml,financePageHtml]){
  assert.match(html,/if\(version\.toLowerCase\(\)==='v3'\)continue/);
  assert.match(html,/api\/finance/);
 }
 assert.doesNotMatch(overviewHtml,/OOS V3\/V4/);
 assert.doesNotMatch(overviewHtml,/v3:'\/experiments'/);
 assert.doesNotMatch(financePageHtml,/V1–V5/);
});
