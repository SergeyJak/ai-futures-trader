# V6 autonomous research plan

## Primary goal
Identify strategies with reproducible **out-of-sample net-of-fee, slippage and funding** returns and controlled drawdowns. No live orders without independent validation.

## Current verified limitations
- Provider history includes partial exits and duplicate updates. Count only fully closed unique positions.
- Entry classification requires completed market candles, no look-ahead, and fresh timestamps. Coverage is sparse.
- Copytrader provider PnL is not equivalent to replicable account PnL.

## First executable candidate: long dip reversal (paper only)
Research module: `src/v6-paper-prototype.ts`. Signal: lookback decline of at least 0.5%, then a completed candle closing higher than the prior candle. Enter at **next completed candle close**, apply adverse entry/exit slippage and 0.06% fee each side. Exit on 1% stop, 2% target or 30 completed 1-minute bars, whichever comes first. These are **initial unoptimized test parameters**, not proven optimal. For realistic intrabar stop fills, next iteration needs OHLC candles, conservative stop-gap modeling and liquidity assumptions; close-only backtests are preliminary.

## Required next steps (autonomous)
1. Validate complete history and deduplication; monitor API 429 cooldown and provider pagination.
2. Run dip-reversal, momentum and passive baselines over the same chronologically partitioned historical candles. Separate train/validation/untouched holdout by time, not random trade split.
3. Model realistic execution, spread, slippage, fees and funding; quantify profit factor, expectancy, max drawdown, trade counts and uncertainty. Reject fragile parameter sets and thin samples.
4. Only then enable a separate paper-only strategy runner with auditable fills and position accounting. Do not enable live orders.
5. At every hourly review inspect GitHub CI, Railway deploy/logs, latest evidence, and fix newly discovered defects to completion. Update this plan and priorities.

**Status:** candidate strategy implementation only. No validated out-of-sample edge, and no real-money trading authorization.
