# SOL Recovery Breakout: preregistered research protocol

Status: hypothesis only. Not evidence of positive expectancy. No trading configuration changes.

## Data and selection
- Use only confirmed, continuous SOLUSDT 1-minute OHLCV from PostgreSQL.
- Split chronologically: earliest 60% discovery, next 20% validation, final 20% untouched holdout.
- In discovery, extract 20 highest net-return long opportunities **and 20 losing/control opportunities** using the same entry/exit constraints. Do not cherry-pick only winners.
- Every indicator must be calculated from candles closed strictly before the entry. Fill at the next minute open; for an intrabar stop and target on the same bar, assume stop first.
- Reject missing minutes, overlapping positions, duplicate signals, and any trades crossing split boundaries.

## Candidate rule to test (freeze before holdout)
- Long only. A completed 30-minute window has a decline of at least 1.5% from its high to its last close.
- Last completed 5-minute close exceeds the prior completed 5-minute high (reclaim).
- The last completed 5-minute volume is at least 1.5 times the median of the preceding twelve completed 5-minute volumes.
- Enter at next minute open; stop 0.8% below entry; take-profit 1.6% above entry; exit after 120 minutes if neither hit.
- Maximum one open position; no leverage. Apply actual paper commission and slippage assumptions on both sides, plus funding if held across a funding timestamp. Missing funding means net is provisional.

## Decision
Report sample sizes, net USDT and percent per 100 USDT, max drawdown, win rate, expectancy and confidence interval separately for discovery, validation and holdout; compare to time-matched unfiltered control. Report 20 discovery winners with timestamps and equal-sized losers, but never use holdout to tune thresholds. Require at least 30 independent holdout trades before a profitability claim. If fewer, label insufficient evidence and keep collecting paper observations.

This document is a specification for a read-only research runner, not an executed backtest. Implement runner and regression tests before claiming outcomes.
