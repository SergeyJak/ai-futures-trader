import {scoreClosedTrade,summarizeReturns,DEFAULT_OOS_CONFIG,type CompletedTrade} from './v6-oos-backtest.js';

/** Registered before the forward window. Do not move this boundary after observing results. */
export const V6_FORWARD_START_MS=Date.parse('2026-10-15T00:00:00Z');
export const V6_FORWARD_PRIMARY_PATTERN='dip_reversal' as const;
export const V6_FORWARD_MINIMUM=30;

/**
 * Fixed prospective observational evaluation of copytrader fills.
 * The primary pattern and start date are immutable; no pattern selection on test data.
 * Open snapshots and partial closes must be filtered by the caller.
 */
export function fixedV6ForwardHoldout(trades:CompletedTrade[],asOfMs=Date.now()){
 if(!Number.isFinite(asOfMs))throw Error('Invalid as-of time');
 const seen=new Set<string>();
 const valid=trades.filter(t=>{
  if(seen.has(t.id))return false;
  seen.add(t.id);
  return Number.isFinite(t.openedMs)&&Number.isFinite(t.closedMs)&&t.closedMs>t.openedMs&&t.closedMs<=asOfMs&&Number.isFinite(t.entry)&&Number.isFinite(t.exit)&&t.entry>0&&t.exit>0;
 });
 const train=valid.filter(t=>t.closedMs<V6_FORWARD_START_MS);
 const future=valid.filter(t=>t.openedMs>=V6_FORWARD_START_MS);
 const primary=future.filter(t=>t.pattern===V6_FORWARD_PRIMARY_PATTERN);
 const scored=primary.map(t=>scoreClosedTrade(t,DEFAULT_OOS_CONFIG));
 return {
  status:asOfMs<V6_FORWARD_START_MS?'awaiting_start' as const:primary.length<V6_FORWARD_MINIMUM?'collecting' as const:'evaluated' as const,
  mode:'prospective-observational-only' as const,
  primaryPattern:V6_FORWARD_PRIMARY_PATTERN,
  fixedStart:new Date(V6_FORWARD_START_MS).toISOString(),
  minimumForwardTrades:V6_FORWARD_MINIMUM,
  preCutoffClosed:train.length,
  forwardAllPatterns:future.length,
  forwardPrimaryCount:primary.length,
  excludedOverlappingBoundary:valid.filter(t=>t.openedMs<V6_FORWARD_START_MS&&t.closedMs>=V6_FORWARD_START_MS).length,
  forwardPrimary:primary.length>=V6_FORWARD_MINIMUM?summarizeReturns(scored):null,
  baseline:future.length>=V6_FORWARD_MINIMUM?summarizeReturns(future.map(t=>scoreClosedTrade(t,DEFAULT_OOS_CONFIG))):null,
  assumedRoundTripCostsPct:2*(DEFAULT_OOS_CONFIG.feePerSide+DEFAULT_OOS_CONFIG.slippagePerSide)*100,
  warning:'Only observed closed copytrader fills; NOT an executable strategy backtest. Fees and slippage modelled, funding and execution delay unverified. No performance inference before minimum sample. Fixed date and primary pattern must not be retuned.'
 };
}
