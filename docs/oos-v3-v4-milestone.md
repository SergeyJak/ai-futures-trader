# V3/V4 OOS research milestone

Goal: obtain a reproducible **read-only** decision report from saved virtual trades, not activate trading.

1. Use a fixed UTC cutoff at least seven full days in the past, with 30 days training and seven days untouched holdout.
2. Run `npm run research:entries -- 2026-10-09T00:00:00Z 30` from an authorized environment with **read-only** DATABASE_URL access. Choose another cutoff if the historical coverage is insufficient.
3. Capture both JSON lines (v3 and v4), including sample quality, training-only selections, holdout results, and `decisions`.
4. Treat `candidate-for-paper` as a research shortlist only. Do not automatically change virtual or live trading configuration.
5. If there are zero candidates, report that clearly, investigate candle coverage and training sample sizes, then design a **new predeclared hypothesis** for a later window. Never tune thresholds using this holdout.
6. Require another chronological forward period before any strategy promotion; evaluate fees, slippage, drawdown and stability across symbols.

No study was executed against the deployed database as part of this pull request. Code and tests alone do not establish profitability.
