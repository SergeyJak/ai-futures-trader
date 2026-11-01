# Fourth frozen experiment: hourly breakout confirmed by volume

2026-11-01. User authorized proceeding after the initial screens and asked for an estimate. One fixed variant, declared before reading its results, not a parameter sweep.

`volume_breakout_4h`: same hourly close breakout of the previous 20 hourly highs/lows, EMA100 trend and 12h EMA100 slope as original trend breakout. Additionally require current completed hourly volume >=1.5 times the median of the previous 20 complete hourly volumes. The current hour is excluded from the reference median. All inputs are known before next-hour-open entry.

Fixed target 0.8% of executed entry price, fixed stop 0.4%, maximum hold 4 hours. Protective exits may occur before 1h. No trailing stop. Target is deliberately larger than baseline 0.18% modeled round-trip costs, but that alone is not evidence of positive expectation. No retuning after results.

100 USDT total account, one position per symbol, modeled risk <=0.25% equity per entry including costs, notional <=1/3 equity per symbol, no leverage, existing minimum quantities, minute-based protective execution and time exits, same three fee/slippage scenarios. Funding remains unknown and excluded.

All data are reused historical observations, so the result is exploratory and cannot establish independent prospective profitability. Compare both baseline and elevated costs, chronological monthly performance, net win rate, drawdown, and trade concentration. Do not promote if evidence is insufficient or final-month behavior is poor.

Historical spreads, tick paths, queue position and limit-order fills are not present in this candle cache. This test cannot verify their actual cost or claim that limit orders lower costs without missed fills/adverse selection. Those require a separate prospective data collection experiment.
