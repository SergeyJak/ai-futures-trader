/** One-shot read-only OOS study. Run explicitly, never in the trading tick loop.
 * Example: DATABASE_URL=... npm run research:entries -- 2026-10-09T00:00:00Z
 */
import 'dotenv/config';
import pg from 'pg';
import {evaluateStoredEntryFilters} from './entry-filter-stored.js';
import {summarizeOos} from './entry-filter-decision.js';
const cutoff=process.argv[2],minTest=Number(process.argv[3]??30);
if(!cutoff||!Number.isFinite(Date.parse(cutoff))||!Number.isInteger(minTest)||minTest<1){
 console.error('Usage: npm run research:entries -- <fixed-ISO-cutoff> [min-test-trades>=1]');
 process.exitCode=2;
}else if(!process.env.DATABASE_URL){
 console.error('DATABASE_URL required (read-only database credentials recommended)');
 process.exitCode=2;
}else{
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,statement_timeout:120000,connectionTimeoutMillis:10000});
 let client:pg.PoolClient|undefined;
 try{
  client=await pool.connect();
  await client.query('BEGIN READ ONLY');
  for(const version of ['v3','v4'] as const){
   const result=await evaluateStoredEntryFilters(client,version,cutoff,minTest);
   const decisions=summarizeOos(result.scores);
   console.log(JSON.stringify({kind:'fixed-oos-entry-filter-study',generatedAt:new Date().toISOString(),...result,decisions,candidateCount:decisions.filter(d=>d.decision==='candidate-for-paper').length}));
  }
  await client.query('ROLLBACK');
 }catch(e){console.error('OOS_STUDY_FAILED',e);process.exitCode=1;if(client){try{await client.query('ROLLBACK')}catch{ /* connection may be lost */ }}}
 finally{client?.release();await pool.end()}
}
