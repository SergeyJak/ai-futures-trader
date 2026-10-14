import type pg from 'pg';
import {v6Insights} from './v6-insights.js';
import {summarizeV6HoldingCohorts} from './v6-holding-cohorts.js';
/** Read-only historical cohorts, independent of provider polling. */
export async function readV6CohortSnapshot(pool:pg.Pool){
 const result=await pool.query<{trader_id:string;kind:string;raw:Record<string,unknown>}>("SELECT trader_id,kind,raw FROM v6_position_observations WHERE kind='history' ORDER BY id DESC LIMIT 5000");
 const insights=v6Insights(result.rows);
 const report=summarizeV6HoldingCohorts(insights);
 return {at:new Date().toISOString(),rawHistoryRecords:insights.rawHistoryRecords,closedHistoryRecords:insights.historyRecords,partialHistoryRecords:insights.partialHistoryRecords,duplicateHistoryRecords:insights.duplicateHistoryRecords,sampleLimit:5000,cohorts:report.cohorts.map(({traderIds,...rest})=>rest),caveat:report.warning};
}
