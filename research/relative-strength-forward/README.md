# Frozen relative-strength reversal: paper research only

Candidate: on Binance USDT perpetuals, rank previous28 complete daily close
returns for BTC, ETH, SOL, BNB, XRP, DOGE, ADA, LINK. Require prior7day mean quote
turnover >=50millionUSDT, at least4 eligible instruments. Long2worst, short2best;
each entry leg <=25% budget with cost reserve. Decide00UTC, execute01UTC. Keep
quantities when membership/directions remain identical; otherwise close/reopen
all legs. Round down to frozen Nov5 MARKET_LOT_SIZE, require MIN_NOTIONAL. If any
leg is infeasible, remain entirely flat. Do not replace excluded BTC with a
convenient substitute. Current-rule changes stop replay for review.

Forward start **2026-11-06 01:00 UTC**,100USDT. No parameter tuning based on forward
results. Baseline fees0.06%/fill, slip0.03%; stress fees0.08%, slip0.07%.
Funding uses public settlement marks/rates, assigned to old positions before
rebalance; millisecond jitter <1s is normalized to verified8h slots. Missing
funding/hourly data fails rather than implying zero costs. Endpoint marks use
hour-open only; forward positions remain open with estimated closing costs.

Run with Python3.12+ (stdlib only):

```sh
python3 -m unittest discover -s research/relative-strength-forward
python3 research/relative-strength-forward/replay.py \
  --snapshot packet.json --sha256 SHA256_OF_PACKET \
  --as-of 2026-11-07T02:00:00Z --output checkpoint.json
```

Before start, replay writes `waiting-for-forward-data`; it never reports fictitious
returns. It rejects future/non-hour boundaries. The offline replay command makes no network requests or orders. The application
now provides an automatic public-data worker; see
[automation](../../docs/relative-strength-automation.md).

## Snapshot contract

`packet.json` contains `source: "binance-usds-public"`, `daily`, `hourly`, `funding`
(each a map of the eight symbols to raw Binance API rows), and
`current_exchange_rules` (current futures exchangeInfo, at least these symbols).
Candles use the standard kline array layout. Daily warmup starts no later than
Oct8 UTC and extends through the last fully closed day. Hourly candles cover
Nov6 01UTC through the report boundary inclusive; the boundary candle is used
only for its open, never its subsequent prices. Funding events cover all held
8h settlements. Preserve raw responses and record SHA256 before invoking replay.
Public connected Binance tools supplied the original research; direct REST
returned451 from the working environment. Production REST availability must be
verified from the deployed worker. The CI workflow tests code only, while the
application schedules the new worker and persists reports in PostgreSQL.

## Evidence and limits

The candidate was chosen from12 variants on known history, not an independent
holdout. Survivorship bias remains in the manually selected8-symbol universe.
With current lot/minimum rules,1h execution delay and funding, Aug1–Nov4 replay:
100→113.85USDT baseline,109.74stress; hourly-close DD3.50%, conservative simultaneous
hourly-extremes bound4.05%/4.10%. Gross exposure drift reached1.09x despite entry
budget1x. Full-month baseline returns:Aug3.27%,Sep9.18%,Oct0.97%; stressOct−0.016%.
This does NOT establish stable10%monthly profitability. Details in audit-summary.json.

Trade-price hourly OHLC is not a full mark-price liquidation path; margin tiers,
exchange execution, real account fees and historical trading-rule changes remain
unverified. Equal nominal long/short exposure is not beta neutrality. No stops or
intraday leverage rebalancing are assumed. Transfer to Bybit is NOT validated;
Bybit REST returned403 in this environment. Do not deploy real trading from this
report. Existing production strategy and collectors are untouched.

Boundary convention: checkpoint includes settlement at its timestamp for existing
positions, but excludes rebalancing at that timestamp and all subsequent hourly
high/low/close prices. Month attribution follows UTC event/hour start. The
simultaneous-extremes statistic is a stress measure, not a guaranteed upper bound
on actual intrahour peak-to-trough drawdown. Fresh daily input is mandatory at
every decision; stale history aborts rather than creating a new signal.
