# AI Futures Trader

Private Bybit USDT perpetual market-monitoring and strategy research platform.

## Phase 1: market data only

- BTCUSDT, ETHUSDT, SOLUSDT, 1-minute candles
- Public Bybit V5 WebSocket market stream
- PostgreSQL candle persistence with idempotent upserts
- HTTP health endpoints, reconnect handling, and tests
- **No trading, credentials, or real-money execution in this phase**

Future phases: backtesting, paper trading, Bybit Demo execution, risk management, and an AI-assisted dashboard. Live trading requires explicit approval and separate controls.
