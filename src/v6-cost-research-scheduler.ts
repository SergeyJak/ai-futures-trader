import type pg from 'pg';
import { historicalCostStressReport } from './research/v6HistoricalCostReport.js';
import type { FrozenSplit } from './research/v6FrozenOos.js';

export function configuredV6FrozenSplit(env: NodeJS.ProcessEnv): FrozenSplit | null {
  const names = ['V6_OOS_TRAIN_BEFORE', 'V6_OOS_TEST_FROM', 'V6_OOS_TEST_BEFORE'] as const;
  if (names.every(name => !env[name])) return null;
  if (!names.every(name => Boolean(env[name]))) throw new Error('All V6 OOS boundaries required');
  return { trainBefore: env.V6_OOS_TRAIN_BEFORE!, testFrom: env.V6_OOS_TEST_FROM!, testBefore: env.V6_OOS_TEST_BEFORE!, embargoHours: 168 };
}

export function createV6CostResearchScheduler(pool: pg.Pool, split: FrozenSplit | null) {
  let running = false;
  let snapshot: unknown = { status: split ? 'pending' : 'not-configured' };
  return {
    snapshot: () => snapshot,
    async run() {
      if (!split || running) return false;
      running = true;
      try {
        snapshot = { status: 'running' };
        const report = await historicalCostStressReport(pool, split);
        snapshot = { status: 'completed', at: new Date().toISOString(), report };
        return true;
      } catch (error) {
        snapshot = { status: 'failed', at: new Date().toISOString(), error: String(error).slice(0,180) };
        return false;
      } finally { running = false; }
    },
  };
}
