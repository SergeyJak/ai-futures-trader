# Frozen prospective paper replay: 4h trend portfolio

Frozen on 2026-11-01 before start **2026-11-02T00:00:00Z**. No orders and no changes to deployed trading. The existing collector continues collecting market candles independently.

Candidate: `portfolio_trend_4h`, `risk1_gross3`, 100 USDT. Exact frozen rules are the 4h configuration in PORTFOLIO_PROTOCOL.md: previous-20-bar breakout, EMA100 trend/slope, ATR14 stop/trail 2/3, at most 7d holding, modeled risk 1% per entry, each symbol notional <=equity, combined gross <=3x equity, static repo minimum quantities. This is a research candidate, not a verified +10%-monthly strategy.

Features may use pre-start history; only entries at/after the start belong to this independent paper account. Account begins at 100 USDT, no inherited positions. Report every new interval without changing rules. Keep baseline, elevated and severe cost paths separately. Mark open positions rather than counting them as closed profit.

`forward_study.py` can refresh a separate forward candle cache from the existing read-only application API and replay the fixed paper account through a specified completed 4h boundary. Source historical files are not overwritten. Without --refresh it only reads cached data. The runner is not a background daemon: it must be invoked manually or by a separately configured scheduled task. The script itself does not send alerts or submit orders.

For an intermediate report, open positions must remain open and marked to market; do not force-liquidate simply because the report ends. Prospective equity includes model liquidation costs on open positions but not actual funding. The report is explicitly provisional while funding, maintenance margin/liquidation and real execution evidence remain unresolved.

Evaluate monthly net returns, full-equity drawdown, number of unique entries, dependence on best trades and the elevated-cost path. Freeze the paper-review target at **at least three full positive calendar months, geometric mean monthly return >=10%, at least 30 closed trades and maximum minute-close drawdown <=15%**. The user delegated risk choice; 15% is a research acceptance ceiling, not a guarantee or a hard stop hiding later losing trades. November starts on its second day and is partial, so the first possible three-full-month review is after February ends. These are review thresholds, not statistical proof or automatic promotion. Actual funding, margin/liquidation and execution remain blocking evidence gaps even if paper targets are reached.

Missing data mean incomplete, not zero return. A losing month remains in the report. Risk or parameters may change only as a separately versioned new hypothesis; do not rewrite the original forward history.
