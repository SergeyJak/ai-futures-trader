# Seventh frozen experiment: multi-asset trend and monthly +10% objective

User now explicitly sets the search objective at +10% of capital per month and delegates implementation/risk choices. Capital remains 100 USDT. This is a research objective, not a guaranteed or established achievable return. No real orders or trading-setting changes.

Evaluate the already specified trend-breakout family across two predeclared timeframes and four risk/exposure policies. Report all policies, not just the best. This is an explicit bounded search on reused history, not independent prospective confirmation.

Signals: completed-bar close breaks the previous 20 bars' high/low, EMA100 trend and EMA100 slope versus 12 bars ago agree. Stop 2 ATR14; trailing stop 3 ATR14 from best completed close, updated only after the signal timeframe closes. One-hour bars have maximum hold 48h; four-hour bars have maximum hold 7d. Four-hour bars require all 240 minutes and start on UTC multiples of 4h; exclude the initial partial block. At least 120 complete signal bars before decisions.

All BTC/ETH/SOL positions share one account. Four policies:

1. `risk025_gross1`: 0.25% equity modeled risk per entry, per-symbol notional <=1/3 equity, total <=equity (the original reference).
2. `risk1_gross1`: 1% risk, same unlevered notional caps, isolates the risk-sizing restriction.
3. `risk1_gross3`: 1% risk, each symbol notional <=equity, combined gross <=3x equity.
4. `risk2_gross3`: 2% risk, each symbol notional <=equity, combined gross <=3x equity.

Gross3 policies are hypothetical perpetual exposure. The simulator does not independently reproduce maintenance margin, liquidation, funding or broker-specific restrictions, so their outputs are not proof that the positions could be maintained on the venue. Gap losses can exceed the stated modeled risk. Risk is a sizing budget, not a guarantee of maximum drawdown.

Use repo quantity minima, entry/exit fees and adverse slippage, next-open execution, minute stops and opening-gap handling. Three original cost scenarios. Check original one-hour reference exactly matches its saved baseline before interpreting additional results.

Report full-period net, monthly equity returns, geometric average over full August/September/October, worst full month, months >=10%, drawdown and trade concentration. July is partial and excluded from the three-month target assessment. A single large month or leverage-scaled P&L is not evidence of stable +10% monthly growth. Report both the average objective and whether every full month meets it; do not invent a favorable interpretation after seeing outputs.
