import type { ClosedPosition, TradeSource } from './v6CostStress.js';

export type FrozenSplit = {
  /** Immutable boundaries: never recompute from incoming positions. */
  trainBefore: string;
  testFrom: string;
  testBefore: string;
  embargoHours: number;
};

export function classifyFrozenCohort(
  position: ClosedPosition,
  split: FrozenSplit,
): 'train' | 'test' | 'embargo' | 'outside' {
  const closed = Date.parse(position.closedAt);
  const trainBefore = Date.parse(split.trainBefore);
  const testFrom = Date.parse(split.testFrom);
  const testBefore = Date.parse(split.testBefore);
  if (![closed, trainBefore, testFrom, testBefore].every(Number.isFinite)
      || !Number.isFinite(split.embargoHours) || split.embargoHours < 0
      || trainBefore > testFrom || testFrom >= testBefore
      || testFrom - trainBefore < split.embargoHours * 3_600_000) {
    throw new Error('Invalid frozen OOS split or insufficient embargo');
  }
  if (closed < trainBefore) return 'train';
  if (closed >= testFrom && closed < testBefore) return 'test';
  if (closed >= trainBefore && closed < testFrom) return 'embargo';
  return 'outside';
}

export function groupFrozenOosBySource(
  positions: readonly ClosedPosition[],
  split: FrozenSplit,
): Record<TradeSource, { train: ClosedPosition[]; test: ClosedPosition[]; embargo: number; outside: number }> {
  const output = {
    kopyon: { train: [] as ClosedPosition[], test: [] as ClosedPosition[], embargo: 0, outside: 0 },
    okx: { train: [] as ClosedPosition[], test: [] as ClosedPosition[], embargo: 0, outside: 0 },
  };
  for (const position of positions) {
    const cohort = classifyFrozenCohort(position, split);
    if (cohort === 'train' || cohort === 'test') output[position.source][cohort].push(position);
    else output[position.source][cohort]++;
  }
  return output;
}
