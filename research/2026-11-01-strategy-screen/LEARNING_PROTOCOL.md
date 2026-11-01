# Sixth frozen experiment: chronological ridge forecasts

The user has prioritized any reproducible profitable algorithm over implementation style, a fixed short holding time or a fixed win rate. Keep the agreed 100 USDT budget and 0.25% per-entry risk target. A longer horizon is an exploratory alternative, not an assertion that the earlier 1–4h requirement was met.

Purpose: replace ad-hoc indicator entries with a measurable predictive dependency. Fit only on past observations; generate subsequent-period decisions before evaluating their outcomes. Historical data are reused and have already been observed by the project: internally chronological predictions are not an untouched prospective holdout.

Three fixed hypotheses: ridge regression for 4h, 24h and 48h forward log return. No parameter grid or reselecting thresholds after inspecting results.

- One regression per asset, no pooled independent-sample claim. First prediction only after 120 hourly feature warmup plus 45 days. Refit every seven days on at most the preceding 45 days of eligible feature/label rows.
- Features: hourly log returns over 1/4/12/24/72h, relative distances to EMA20/EMA100, EMA100 slope over 12h, ATR14/close, last hour range/close, log volume versus prior-24h median, log volume versus prior hour, BTC returns over 4/24h, asset-minus-BTC return over 4/24h. All available at completed-hour time. Feature scaling fitted only on training rows; clip standardized inputs to [-6,6].
- Target: log(open[k+1+H]/open[k+1]) for an observed feature row k. At prediction row j, permit training row k only if k+1+H <= j, leaving the entire most recent hour outside label availability. Freeze that fit until next weekly refit. L2 penalty 100; unpenalized intercept.
- Signal only when |predicted log return| >=max(0.0036, 0.25 * training-target standard deviation). Direction is sign of forecast. This is a fixed hurdle, not a calibrated guarantee of return.
- Entry next hour open, stop 2 ATR14, no profit target or trailing; time exit at horizon 4/24/48h. Existing minute engine, costs, quantity minima, one position per symbol, notional and cash/risk restrictions apply. No new entries whose scheduled full horizon extends past the fixed dataset end.
- Compare always-positive-mean baseline prediction on the same eligible target rows for forecasting error. Report out-of-time MAE/RMSE/correlation and the full trading results. Training accuracy is not evidence of trading profitability.

Run baseline/elevated/severe fees and slippage separately. Funding unknown and excluded. Report every hypothesis even if all fail; no automatic strategy promotion. A potential candidate must earn after costs in more than one chronological block, survive elevated costs and not depend on one extreme trade; any such result still needs future paper evidence and actual funding/execution validation.
