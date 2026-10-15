import { COST_SCENARIOS, type ClosedPosition } from './v6CostStress.js';

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Descriptive statistics of observed closed copytrader fills, NOT a reproducible
 * strategy backtest. All percentages are unleveraged price moves on notional.
 * Funding, actual fees, and the ability to enter at observed prices are unknown.
 */
export function summarizeObservedHoldingRisk(positions: readonly ClosedPosition[]) {
  const holds = positions.flatMap(position => {
    const start = Date.parse(position.openedAt ?? '');
    const end = Date.parse(position.closedAt);
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [(end - start) / 3_600_000] : [];
  });
  const sortedHolds = [...holds].sort((a, b) => a - b);
  const returns = positions.map(p => p.grossReturnPct).filter(Number.isFinite);
  const average = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const holdingStyles = {
    under4h: holds.filter(h => h < 4).length,
    from4hTo48h: holds.filter(h => h >= 4 && h < 48).length,
    atLeast48h: holds.filter(h => h >= 48).length,
  };
  const scenarios = (['baseline', 'elevated', 'severe'] as const).map(scenario => {
    const { feePerSidePct, slippagePerSidePct } = COST_SCENARIOS[scenario];
    const roundTripCostPct = 2 * (feePerSidePct + slippagePerSidePct);
    const adjusted = returns.map(value => value - roundTripCostPct);
    return {
      scenario,
      roundTripCostPct,
      averagePriceReturnAfterEstimatedCostsExcludingFundingPct: average(adjusted),
      negativeAfterEstimatedCostsCount: adjusted.filter(value => value < 0).length,
      fundingKnownCount: positions.filter(p => Number.isFinite(p.fundingPct)).length,
    };
  });
  return {
    closedCount: positions.length,
    validHoldingCount: holds.length,
    medianHoldingHours: median(holds),
    p90HoldingHours: sortedHolds.length ? sortedHolds[Math.ceil(sortedHolds.length * 0.9) - 1] : null,
    holdingStyles,
    grossPriceMove: {
      validCount: returns.length,
      averagePct: average(returns),
      medianPct: median(returns),
      positiveCount: returns.filter(value => value > 0).length,
      worstPct: returns.length ? Math.min(...returns) : null,
    },
    estimatedCostSensitivityExcludingFunding: scenarios,
    note: 'Observed fills only; estimated round-trip fees/slippage, no funding. Cost-adjusted price moves are NOT net profit or out-of-sample evidence of an executable strategy.',
  };
}
