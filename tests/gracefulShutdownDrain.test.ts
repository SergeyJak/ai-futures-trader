import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shutdown drains active paper jobs before closing DB pools',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const stop=source.slice(source.indexOf('async function stop()'));
 assert.match(stop,/while\(paperRunning\|\|solPaperRunning\|\|strategyPaperRunning\|\|v3Running\|\|v4Running\|\|v5Running/);
 assert.ok(stop.indexOf('while(paperRunning')<stop.indexOf('await db.close()'));
 assert.match(stop,/SHUTDOWN_DRAIN_TIMEOUT/);
});
