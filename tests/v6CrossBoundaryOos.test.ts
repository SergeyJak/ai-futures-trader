import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalCostStressReport } from '../src/research/v6HistoricalCostReport.js';

const split = {trainBefore:'2026-09-30T00:00:00Z',testFrom:'2026-10-07T00:00:00Z',testBefore:'2026-10-15T00:00:00Z',embargoHours:168};
const row = (position_id:string,opened_at:string,closed_at:string) => ({
 source:'kopyon' as const,trader_id:'trader',position_id,symbol:'SOLUSDT',
 side:'LONG',opened_at,closed_at,entry_price:'100',exit_price:'101',
});
test('exclude pre-test entries closed inside frozen test window',async()=>{
 const pool={query:async(sql:string)=>({rows:sql.includes('v6_position_observations')?[
 row('cross','2026-10-06T23:59:00Z','2026-10-07T00:01:00Z'),
 row('valid','2026-10-07T00:01:00Z','2026-10-07T00:02:00Z'),
 ]:[]})} as any;
 const report=await historicalCostStressReport(pool,split);
 assert.equal(report.excludedCrossBoundaryEntries,1);
 assert.equal(report.results.find(x=>x.source==='kopyon')?.testCount,1);
});
