# Offline strategy screening — frozen before download and calculation

2026-11-01. Exploratory research only; no production writes or orders.

Goal: identify a reproducible candidate for gradual account growth with small drawdowns. Neither profitability nor a 5% drawdown ceiling is guaranteed. Provisional capital 100 USDT; requested clarification is pending. Report 1000 USDT separately to show minimum-order effects, not as a recommendation to increase capital.

Data: closed 1m candles from the existing database for BTCUSDT, ETHUSDT, SOLUSDT, 2026-07-14 02:00 UTC through 2026-10-31 23:59 UTC. Hourly signals from fully observed consecutive minutes. All signal features use the current completed hourly candle or earlier. Entry at following hour open; minute bars drive stops and targets. No price forward filling.

Three fixed hypotheses, one parameter set each; no tuning after results:

1. **Trend breakout**: hourly close breaks above the previous 20 hourly highs (LONG) or below previous 20 lows (SHORT), with close above/below EMA100 and EMA100 rising/falling versus 12 hours earlier. Initial stop 2 ATR14; trailing stop 3 ATR14 from highest/lowest hourly close since entry, updated only after hourly close. No target, maximum hold 48h.
2. **Trend pullback**: hourly close recrosses EMA20 into the EMA100 trend, and EMA100 slopes in the same direction versus 12h earlier. Initial stop 2 ATR14; fixed take profit 3 ATR14; maximum hold 24h.
3. **Range reversion**: |EMA20−EMA100| < ATR14 and |EMA100−EMA100[-12]| < 0.5 ATR14. Close z-score against last 20 hourly closes <=−2 (LONG) or >=+2 (SHORT). Stop 2 ATR14; target current 20-hour mean, frozen at signal; maximum hold 12h. Reject a target on the wrong side of actual fill.

Risk: one position per symbol, all three symbols share a single equity pool for each hypothesis. Risk budget 0.25% equity per entry including estimated stop execution costs, gross notional <= one third equity per symbol, no leverage. Quantity floored to existing repo contract steps: BTC .001, ETH .01, SOL .1; reject below minimum. Total gross notional <= equity. Mark open positions to market and include estimated closing fees in drawdown. Entry fee deducted immediately; exit fee at closure. Stops handle opening gaps; stop first if both levels touch. Timeout exits at minute open when scheduled. No same-minute reentry following exit. End of study liquidates open positions and labels the closure.

Baseline per-side costs: fee .06%, adverse slippage .03%. Elevated: .08% / .07%. Severe: .10% / .15%. Run each scenario independently with its own cash and fills. Funding NOT available: label all results as excluding funding, no claim of fully net executable profitability. All exchange minimum-size rules come from repo constants, not independently refreshed venue specifications.

Periods: July14–Aug31 development reference, September chronological validation, October chronological evaluation. Compare fixed rules across all periods; do not pick new thresholds from them. The project has already observed historical data and October outcomes, so none of these periods is a genuinely untouched prospective holdout. A positive result creates only a shortlist for a new forward paper test.

Report: full-equity return, absolute P&L, realized and unrealized drawdown, trade count, profit factor, monthly/symbol attribution, costs, skip counts, causal-feature verification and cost sensitivity. Do not pool overlapping strategy variants as independent evidence. Do not promote a strategy based solely on positive total P&L or its best month. If none passes, explicitly report none.
