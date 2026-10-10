# Paper-trading execution audit (2026-10-10)

## Scope
Read-only code audit for accounts 1–11. No historical trades, accounts, signals, risk limits, position or execution settings changed. New /api/audit endpoint calculates independent trade-level reconciliation on up to 5,000 most recent stored trades, grouped by account.

## Confirmed from source
- Realized P&L is (exit-entry)*qty*(LONG?1:-1) minus entry and exit taker fee. The balance deducts entry fee at opening, then adds gross less exit fee at closing. Fees are **not double charged** in these formulas.
- Entry and exit executions use 0.02% modeled adverse slippage each side; the stored prices already include slippage.
- On a 0% market move, two taker fees + modeled slippage cost approximately 0.16% of position notional.
- For accounts 2–11, timeout checks occur after evaluating the full candle's high/low: intraminute STOP/TAKE may override an exit due at the candle open. For account 1 there is no time cap.
- Positions opened at a candle's open are not checked for stops/takes in the entry candle. This is a fill-model limitation shared by accounts 1–11.
- On processing delays >10 minutes the engine jumps past missing candles. For current open positions, subsequent stop/take checks may occur later than they should.
- STOP is prioritized if both STOP and TAKE cross within the same candle. Intraminute order is unknowable from OHLC.
- The current code fills at stop/take level even if candle opens across the stop; gaps may produce optimistic fills.
- Not every strategy can trade every instrument given minQty and risk limits. Reasons now logged as MIN_ORDER_OR_RISK_LIMIT.

## Reconciliation
GET /api/audit. Includes per-account gross profit, total entry+exit fees, **estimated** slippage (counterfactual no-slippage executions), net P&L, win rate, profit factor, arithmetic discrepancy, entry/exit candle presence, estimated reference price outside candle OHLC, and TIME exits with unexpected candle-open reference.
The endpoint is strictly read-only. No financial orders and no historical reconstruction are used to overwrite recorded data.

## Limitations
- The current audit is arithmetic and OHLC plausibility testing, not a perfect tick-level independent replay.
- Slippage cannot be uniquely inferred without actual fill/market orderbook snapshots: the 0.02% is a configured assumption.
- Fees/SL/TP rules and the true sequence of high/low within a 1-minute candle cannot be fully verified from OHLC alone.
- Entry and exit candle timestamps are model timestamps, not exchange fill confirmations.
- Results are not yet a controlled forward-test with corrected execution semantics. Historical accounts remain on their original engine.
- API limits historical inspection to latest 5,000 trades. Account totals may be partial if this cap is reached.

## Recommended next steps
Create an isolated v2 simulator in shadow mode and validate order-event semantics without changing the historical accounts or current strategies. Run the old and corrected engines side by side; promote a corrected engine only after measurements confirm the divergence and after preserving explicit version tags.
