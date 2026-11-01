import type {Bar} from './sol-recovery-breakout.js';
/** Frozen UTC boundaries. Historic 'holdout' has already been inspected; only forward
 * observations after 2026-11-02 may be used as untouched confirmation.
 */
export const SOL_SPLIT_DATES={
 discoveryEnd:Date.parse('2026-09-18T00:00:00.000Z'),
 validationEnd:Date.parse('2026-10-10T00:00:00.000Z'),
 forwardStart:Date.parse('2026-11-02T00:00:00.000Z')
} as const;
export const SOL_SPLIT_LABELS=['discovery','validation','retrospective','forwardHoldout'] as const;
export function splitSolHistory(bars:readonly Bar[]){
 return [
  bars.filter(b=>b.time<SOL_SPLIT_DATES.discoveryEnd),
  bars.filter(b=>b.time>=SOL_SPLIT_DATES.discoveryEnd&&b.time<SOL_SPLIT_DATES.validationEnd),
  bars.filter(b=>b.time>=SOL_SPLIT_DATES.validationEnd&&b.time<SOL_SPLIT_DATES.forwardStart),
  bars.filter(b=>b.time>=SOL_SPLIT_DATES.forwardStart)
 ];
}
