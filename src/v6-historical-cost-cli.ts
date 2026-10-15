import 'dotenv/config';
import pg from 'pg';
import { historicalCostStressReport } from './research/v6HistoricalCostReport.js';

const url = process.env.DATABASE_URL;
const trainBefore = process.env.V6_OOS_TRAIN_BEFORE;
const testFrom = process.env.V6_OOS_TEST_FROM;
const testBefore = process.env.V6_OOS_TEST_BEFORE;
if (!url || !trainBefore || !testFrom || !testBefore) {
  throw new Error('DATABASE_URL and immutable V6_OOS_TRAIN_BEFORE, V6_OOS_TEST_FROM, V6_OOS_TEST_BEFORE required');
}
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10000 });
try {
  const report = await historicalCostStressReport(pool, { trainBefore, testFrom, testBefore, embargoHours: 168 });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  await pool.end();
}
