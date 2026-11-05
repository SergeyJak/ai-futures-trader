# Public market data for execution research

This collector records public Bybit USDT-linear data for the configured `MARKET_SYMBOLS` (BTC/ETH/SOL by default). It submits no orders, uses no private API keys, and does not change strategy decisions or balances.

## Deploy on Railway

Merge the collector PR into the branch already deployed by `market-collector`. Railway's existing GitHub deployment builds and starts the application normally. No additional service, package, volume, secret or manual SQL migration is required. New tables/indexes are created at startup with the existing `DATABASE_URL`.

Defaults work without new variables:

| Variable | Default | Meaning |
|---|---|---|
| `RESEARCH_DATA_ENABLED` | `true` | Set `false` to stop research collection; existing candle and paper logic continues. |
| `RESEARCH_DATA_RETENTION_DAYS` | `7` | Quote/trade retention, integer 1–30 days. |
| `RESEARCH_TAKER_FEE_RATE` | `0.0006` | Explicitly assumed rate, **0.06%** per side. |
| `RESEARCH_MAKER_FEE_RATE` | `0.0002` | Explicitly assumed rate, **0.02%** per side. |

Fees remain assumptions even when set by an operator: public feeds do not verify the account's VIP tier, fee rebates or actual fills. The API reports `verified: false`. Values are decimal rates, not percentages or basis points.

`BYBIT_PUBLIC_WS` is the existing secure public-linear endpoint. Research uses a separate connection, with three public topics per symbol: `orderbook.50`, `publicTrade` and `tickers`. A maximum of ten symbols prevents unbounded subscriptions. Research has its own PostgreSQL pool of at most two connections, 5s connection/acquisition timeout, 5s server statement timeout and 6s client query timeout. Schema/transport/persistence errors are reported independently from the original candle connection.

## What is saved

- `research_market_samples`: one observation per symbol/10-second bucket when a fresh valid book is available. Best bid/ask and quantities, up-to-50-level depth notionals/counts, exchange/local timestamps, update IDs/sequence, connection identity, plus fresh mark/index price, open interest and indicative funding fields when present.
- `research_trade_buckets`: 10-second event-time aggregates of Buy/Sell counts, quantities and notionals, first/last trade times and a stream-continuity flag. Trade IDs are deduplicated in bounded memory. Finalization waits 30 seconds for out-of-order arrivals; later records are dropped and counted.
- `research_funding_rates`: actual public settlement rates/times, requesting the past 120 days in at most five pages of 200 rows per symbol. Poll every ten minutes; 403/429 or provider rate-limit responses impose a one-hour cooldown. The page cap and invalid/repeated records are explicit incomplete-coverage reasons.
- `research_collector_status`: last state, coverage of requested funding windows, stale/missing observations, dropped/duplicate/late events and persistence errors.

Quotes are samples, not a lossless tick archive. Public trades are aggregates, not individually retained records. No empty/missing bucket is forward-filled or interpreted as zero cost. A continuous connection does not prove that every exchange trade was received. Mark/index/ticker delta fields retain individual freshness and become null when stale; unrelated ticker updates do not refresh old fields.

The orderbook requires a snapshot, resets on reconnect/server restart and rejects crossed/stale/invalid states. Update IDs can legitimately jump: nonconsecutive IDs alone do not prove a gap. A regression or invalid book forces reconnection/resnapshot.

Raw ticks and full book snapshots are not persisted. At three active symbols, the maximum regular quote sampling is about 25,920 rows/day; trade buckets are of similar order when active. At seven days this is about 181,440 rows per short-data table, plus indexes/row overhead. Exact disk usage depends on traffic and PostgreSQL. Hourly retention deletes at most 5,000 expired rows per table per run; catch-up is bounded. Funding rates retain 730 days and are much smaller.

Memory bounds: <=50 levels per side/symbol, <=12 pending trade buckets/symbol, <=100,000 recent trade IDs globally, one persistence retry batch (expires after 60s), single-flight persistence/funding/retention jobs, <=2 MiB WebSocket frames. Overflows/failures are counted. Shutdown cancels funding requests, terminates the public socket, drains active research queries and records discarded pending data before closing the dedicated pool.

Trade IDs expire at their event bucket's finalization boundary (bucket end + 30 seconds), when replays are already rejected as late. Expiration runs on receipt and on flush, handles out-of-order event buckets, and preserves IDs across reconnects until that boundary. A burst exceeding 100,000 still-live IDs can still cause explicitly marked drops; finalized IDs no longer crowd out current trades. After deploying this fix, check counter **increments** and new incomplete buckets; an old cumulative counter or a process restart alone cannot prove recovery. Historical incomplete rows remain incomplete.

## Readiness and API

After deployment, open **`/api/research-data`**. It shows current runtime state plus per-symbol table counts/earliest/latest observations and persisted errors. Confirm:

1. `runtime.storageReady` is true.
2. `runtime.microstructure.connected` is true and each `books[].ready` becomes true.
3. Sample rows and their latest timestamps start advancing within roughly 10–20 seconds of a valid snapshot.
4. Trade rows start advancing after the 30-second lateness allowance (typically 40–50 seconds after startup). Check continuity and drop counters.
5. Funding coverage appears after the initial public REST requests. Read each symbol's `complete`, requested range, pages and error/reason. Empty/blocked history is not proof of zero funding.

All routes accept GET only and return JSON:

```text
/api/research-data
/api/research-data/samples?symbol=BTCUSDT
/api/research-data/trades?symbol=BTCUSDT
/api/research-data/funding?symbol=BTCUSDT
```

History routes accept ISO `from`/`to` timestamps **with explicit timezones**. Defaults: last hour for samples/trades; last 30 days for funding. A single request may span at most 24 hours for samples/trades or 31 days for funding, with at most 1,500 rows, newest first. `possiblyTruncated: true` means request smaller adjacent windows; 1,500 ten-second observations cover about 4h10m. There is no synthetic fill of gaps. Unsupported symbols/ranges return 400, unavailable storage returns 503, non-GET returns 405. Reads never trigger provider calls or collection writes.

Example:

```text
/api/research-data/funding?symbol=BTCUSDT&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z
```

The original `/health`, `/ready`, candle collection, existing reports and paper accounts retain their existing semantics. Research-specific failure is visible on the new endpoint rather than converted into successful zero-valued market data.

## Interpretation and historical limits

Funding settlements can backfill if Bybit returns that history. Book/ticker/trade samples start **at deployment**, not a previously chosen strategy-test date, and cannot reconstruct historical spreads from old candles. Rates plus sampled mark prices support funding estimates; they do not independently verify exact position cash flows. Actual account fees, queue position, market impact, synchronized executable fills and liquidation remain separate evidence requirements.

This PR supplies observations for later research. It does not activate a new strategy or establish a profitable algorithm. Historical financial ledgers are not rewritten.

## Verification

`npm run check` builds TypeScript and runs the existing and new tests. New tests cover book resets/deltas/staleness, per-field ticker timestamps, duplicates/out-of-order/late trades, buffer limits, funding pagination/provider errors, idempotent parameterized persistence, range/method limits, retry/backpressure and shutdown. The PostgreSQL integration test runs when `TEST_DATABASE_URL` is set (already provided by GitHub Actions).

## Burst diagnostics (Nov 5)

The bounded default cache now holds 100,000 live trade IDs. `peakDedupIds` records the process lifetime high-water mark; `dedupLimit` reports capacity. `dedupCapacityDrops`, `bucketCapacityDrops` and `numericOverflowDrops` partition `droppedTrades` (dedup takes precedence if both limits apply). All reset on restart. More capacity uses more bounded memory and does not guarantee lossless collection.

`tradeObservations` reports the last received structurally valid trade-array message per symbol, including empty arrays; it is not proof of a complete exchange feed. Historical timestamps remain visible across reconnects. Missing buckets remain unknown, never manufactured zero-volume intervals. Historical loss is not repaired.
