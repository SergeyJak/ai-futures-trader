import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('only current collection and monitoring use unconditional recurring timers',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const timers=[...source.matchAll(/const (\w+)=setInterval\(/g)].map(m=>m[1]).sort();
 assert.deepEqual(timers,['repairTimer','statsTimer','storageTimer']);
 assert.match(source,/createLegacyScheduler\(legacyJobsEnabled\(process.env\)\)/);
 assert.match(source,/relativeStrengthJob\.start\(\)/);
 assert.match(source,/await researchData\.runtime\.start\(\)/);
 assert.match(source,/stream\.start\(\)/);
 for(const name of ['paperTimer','solShortTimer','v8Timer','sol5mTimer','strategyPaperTimer','solPaperTimer','v5Timer','v4Timer','v3Timer','historyTimer','v6Timer','okxTimer']){
  assert.ok(source.includes(`const ${name}=legacy.every(`),name);
 }
 const startup=source.split('\n').filter(line=>line.includes('setTimeout('));
 assert.equal(startup.length,2);
 assert.ok(startup.some(line=>line.includes('void repair()')));
 assert.ok(startup.some(line=>line.includes('new Promise')));
});
