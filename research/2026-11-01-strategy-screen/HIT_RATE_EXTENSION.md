# Second preregistered experiment: user-requested frequency of wins

The user clarified the goal after seeing the first three results: approximately two profitable trades for every losing trade. Interpret provisionally as net win rate >= 2/3, alongside positive net after costs and small drawdown. This is a research objective, not a promised rate. A sequence of two wins and one loss cannot be guaranteed.

First-screen results remain unchanged. Trend breakout is an exploratory positive candidate but has a low hit rate and fails this added objective.

Before calculating a second screen, freeze two additional hypotheses. Use the exact same data, no leverage, 100 USDT, instrument steps, size constraints, costs, and accounting. These are new hypotheses informed by the first screen, so their results on this reused history are exploratory, not independent confirmation.

1. `pullback_short_target`: same hourly EMA20 recross in EMA100 trend and slope as original trend pullback. Fixed stop 1.5 ATR14, target 1 ATR14, max hold 12h.
2. `range_short_target`: same hourly range filter and |z|>=2 entry as original range reversion. Fixed stop 1.5 ATR14, target 1 ATR14, max hold 12h; no frozen mean target.

No parameter grid and no selecting a different target after inspecting outcomes. Target/stop reward ratio is 2/3, requiring >60% winners before costs if every exit is stop or target; net breakeven is higher and depends on volatility and actual fills. Two winners to one loser can still be unprofitable after costs.

Only shortlist if positive over full history and the final chronological month, reasonably distributed across months and trades, net win rate >=2/3 with sufficient samples, model drawdown <=5%, positive under elevated costs, and no unresolved execution or funding evidence gap. Even passing is a reason for a new forward paper test, not deployment to real trading.
