# Public Research Market Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. User delegated implementation; proceed inline without additional approval questions.

**Goal:** Deliver a complete PR collecting public funding, spread/depth, trades and mark prices for honest strategy cost analysis.

**Architecture:** Pure parsers/state and bounded aggregates feed parameterized PostgreSQL persistence. Independent public WebSocket and funding polling do not participate in trading decisions.

**Tech Stack:** Existing TypeScript/Node >=22, ws, pg, node:test; no new dependencies.

**Spec:** docs/superpowers/specs/2026-11-01-research-market-data-design.md

## Global Constraints
- Public data only; no order routes or private credentials; preserve existing strategy settings.
- Symbols follow MARKET_SYMBOLS; 10-second buckets; 30-second freshness/lateness; seven-day short-data retention; 730-day funding retention.
- Funding backfill <=120 days, <=5 pages of <=200 per symbol, poll every 10 minutes, 403/429 cooldown one hour.
- Bounded writes, memory, HTTP reads and retention batches; missing observations remain missing.

## Review Focus
- Snapshot/update resets and reconnects must not generate apparently valid crossed/stale depth.
- Replay/retry/late trades must not inflate volume or create false zero-coverage claims.
- REST failures, timeouts and repeated pages must stop bounded work and remain visible.
- A slow database must not create unbounded queues or block minute candle processing.
- Shutdown must stop timers/sockets and finish or bound research writes before pool close.

### Task 1: Storage and explicit quality reporting
Files: src/research-data-store.ts; tests/research-data-store.test.ts.
Interfaces: store.init(), writeSamples(rows), writeTradeBuckets(rows), writeFunding(rows), saveStatus(name,status), prune(now), report(symbols), samples(symbol,from,to), funding(symbol,from,to).
- [ ] Write failing fixture tests for parameterized idempotent writes, retention limits and missing coverage.
- [ ] Run RED, implement schema/store, run GREEN and build.

### Task 2: Public funding ingestion
Files: src/research-funding.ts; tests/research-funding.test.ts.
Interfaces: collectFunding(symbols,now,fetcher,signal) returns rows and bounded coverage/errors; consumes funding row type.
- [ ] Write and run failing tests for range validation, pagination, repeated pages, 403/429, timeout cancellation.
- [ ] Implement bounded settlement ingestion and verify GREEN.

### Task 3: Orderbook/trade/ticker state
Files: src/research-microstructure.ts; tests/research-microstructure.test.ts.
Interfaces: state.connect/disconnect, ingest(payload,receivedAt), sample(now), drainTrades(now), status(now).
- [ ] Write and run RED fixtures for all feed-quality invariants in spec.
- [ ] Implement bounded pure state and pass targeted tests/build.

### Task 4: Runtime, configuration and API integration
Files: src/research-data-runtime.ts; src/index.ts; .env.example; docs/RESEARCH_DATA.md; tests/research-data-runtime.test.ts.
Interfaces: runtime.start(), stop(), status; consumes store and state and injected socket/fetch for tests.
- [ ] Write and run RED integration tests for subscription, reconnect, backlog, fetch overlap and shutdown.
- [ ] Implement lifecycle, periodic bounded persistence/funding/retention, read-only API routes and env parsing.
- [ ] Document deploy/readiness/retention/assumed fees and run npm run check.

### Task 5: Review and publish complete PR
- [ ] Fresh review of the whole diff against spec, fix material findings with failing regression tests.
- [ ] Verify full build/tests, inspect final diff for strategy/order changes, publish separate PR with deployment steps and evidence.
