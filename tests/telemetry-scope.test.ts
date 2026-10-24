import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('routine telemetry excludes retired research reporting but preserves its collection loop',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const begin=source.indexOf('async function reportTelemetry(){');
 const end=source.indexOf('const telemetryTimer=',begin);
 assert.ok(begin>=0&&end>begin,'telemetry function exists');
 const routine=source.slice(begin,end);
 assert.doesNotMatch(routine,/db\.v3Report\s*\(/);
 assert.doesNotMatch(routine,/AI_FUTURES_V3/);
 assert.match(source,/async function runIndependentV3\s*\(/);
 assert.match(source,/const v3Timer\s*=\s*setInterval/);
});
