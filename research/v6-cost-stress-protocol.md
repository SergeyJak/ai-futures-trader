# V6 cost-stress research protocol (isolated, no execution)

## Eligibility and data integrity
- Use only verified closed positions with explicit exit timestamp and realized exit evidence. Open-position snapshots are never treated as closed trades.
- Deduplicate by source + trader + instrument + position identifier + closure timestamp; retain provenance and exclusion reasons.
- Report Kopyon and OKX independently. Never pool the sources to select a winner.
- Map source instrument symbols to candle symbols explicitly; reject ambiguous mappings.
- Require complete, confirmed candles through the simulated exit. Missing candles must not be forward-filled.

## Signal and execution
- Compare dip reversal (enter only after a confirmed reversal) with momentum continuation (enter after a confirmed breakout). Keep the definitions and thresholds fixed before evaluating the holdout.
- Use only information available at signal time. Fill no earlier than the next candle open; do not enter at the observed copytrader fill retrospectively.
- Evaluate 4h, 12h, 24h, 48h, 72h and 7d horizons plus a separately defined stop/take policy. Mark truncated outcomes separately.

## Stress scenarios
All rates are **per side** on traded notional; round-trip costs are twice the sum of fee and slippage. These are synthetic stress assumptions, not exchange quotes.

| Scenario | Fee / side | Slippage / side | Round-trip total |
| --- | ---: | ---: | ---: |
| Baseline | 0.055% | 0.025% | 0.160% |
| Elevated | 0.080% | 0.070% | 0.300% |
| Severe | 0.100% | 0.150% | 0.500% |

Also account for funding using historical funding events when available. If funding is unavailable, label the estimate incomplete and do not claim net profitability. Calculate net return on position notional; report leveraged equity returns only with explicit leverage and liquidation assumptions.

## Out-of-sample evaluation
- Chronological train/validation/test splits by close time, with a purge/embargo of at least the maximum holding horizon to prevent overlap leakage.
- Freeze the cohort and parameter set before running holdout evaluation. Include source, symbol, trader, market regime and holding-period breakdowns.
- Report sample size, coverage, win rate, median/mean net return, maximum drawdown, confidence interval (trader-cluster bootstrap), and baseline comparison.
- Require positive holdout improvement over the baseline under the elevated cost scenario, sufficient coverage, and stability across sources before promoting a candidate. Otherwise mark inconclusive or rejected.

## Acceptance tests to implement before promotion
1. Open snapshots are excluded from closed-trade denominators.
2. Duplicated closures do not inflate trade counts.
3. Signal features never use future candles; execution is next-bar or later.
4. Cost sensitivity is monotonic for otherwise identical fills.
5. Missing funding/candles produce explicit incomplete results.
6. Source separation and chronological embargo are enforced.
7. No research code can submit orders or alter production strategy settings.

This file is a research specification, **not** a completed backtest or evidence of profitability.
