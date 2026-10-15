export const COST_SCENARIOS = {
  baseline: { feePerSidePct: 0.055, slippagePerSidePct: 0.025 },
  elevated: { feePerSidePct: 0.080, slippagePerSidePct: 0.070 },
  severe: { feePerSidePct: 0.100, slippagePerSidePct: 0.150 },
} as const;

export type CostScenario = keyof typeof COST_SCENARIOS;
export type TradeSource = 'kopyon' | 'okx';
export type ClosedPosition = {
  source: TradeSource;
  traderId: string;
  positionId: string;
  symbol: string;
  closedAt: string;
  grossReturnPct: number;
  fundingPct?: number;
};
export type PositionSnapshot = {
  source: TradeSource;
  traderId: string;
  positionId: string;
  symbol: string;
  observedAt: string;
  status: 'open';
};

export function deduplicateClosedPositions(positions: readonly ClosedPosition[]): ClosedPosition[] {
  const seen = new Set<string>();
  return positions.filter((position) => {
    if (!Number.isFinite(position.grossReturnPct) || !Number.isFinite(Date.parse(position.closedAt))) return false;
    const key = [position.source, position.traderId, position.symbol, position.positionId, position.closedAt].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function stressTrade(position: ClosedPosition, scenario: CostScenario) {
  const costs = COST_SCENARIOS[scenario];
  const roundTripCostPct = 2 * (costs.feePerSidePct + costs.slippagePerSidePct);
  const fundingKnown = position.fundingPct !== undefined && Number.isFinite(position.fundingPct);
  return {
    source: position.source,
    scenario,
    roundTripCostPct,
    estimatedNetReturnPct: fundingKnown ? position.grossReturnPct - roundTripCostPct + position.fundingPct! : null,
    excludingFundingPct: position.grossReturnPct - roundTripCostPct,
    complete: fundingKnown,
  };
}

export function stressBySource(positions: readonly ClosedPosition[]) {
  const closed = deduplicateClosedPositions(positions);
  return (['kopyon', 'okx'] as const).map((source) => {
    const cohort = closed.filter((position) => position.source === source);
    return {
      source,
      closedCount: cohort.length,
      scenarios: (Object.keys(COST_SCENARIOS) as CostScenario[]).map((scenario) => {
        const results = cohort.map((position) => stressTrade(position, scenario));
        const complete = results.filter((result) => result.complete);
        const observed = results.map(result => result.excludingFundingPct).sort((a,b) => a-b);
        const n = observed.length;
        return {
          scenario,
          averageExcludingFundingPct: n ? observed.reduce((sum,value) => sum+value,0)/n : null,
          p10ExcludingFundingPct: n ? observed[Math.floor((n-1)*0.1)] : null,
          lossShareExcludingFunding: n ? observed.filter(value => value<=0).length/n : null,
          completeCount: complete.length,
          incompleteFundingCount: results.length - complete.length,
          averageNetReturnPct: complete.length
            ? complete.reduce((sum, result) => sum + result.estimatedNetReturnPct!, 0) / complete.length
            : null,
        };
      }),
    };
  });
}
