# Development roadmap

## Phase 1: ingestion
- [x] TypeScript source and test scaffolding
- [x] Bybit public 1m kline stream (BTCUSDT, ETHUSDT, SOLUSDT)
- [x] PostgreSQL idempotent upserts
- [x] Liveness and readiness probes
- [x] GitHub Actions CI configuration
- [ ] Verify green CI and production runtime
- [ ] Deploy Railway service and PostgreSQL
- [ ] Historical REST backfill and missing-candle recovery

## Phase 2: research
- [ ] Backtest with trading fees, slippage and out-of-sample validation

## Phase 3: paper mode
- [ ] Simulated order lifecycle and independent 0.5%-risk engine

## Phase 4: Bybit Demo execution
- [ ] Restricted demo keys, order reconciliation, protective stops, kill switch

## Phase 5: UI and AI
- [ ] Private React PWA, Telegram notifications, explainable trade analysis

## Phase 6: guarded Live
- [ ] Manual authorization after validated demo record; never auto-enable
