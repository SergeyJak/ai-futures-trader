# Third frozen experiment: user-approved 1–4-hour horizon

User confirmed 100 USDT and typical desired holding 1–4 hours. Maximum hold is 4h; protective stops and targets may exit earlier than 1h. Never suppress a stop just to enforce a minimum holding time.

Before this calculation freeze three rules, with no parameter optimization:

- `short_breakout`: original hourly 20-bar breakout plus EMA100 slope/trend filter; stop 1.5 ATR14, take 1 ATR14, 4h maximum.
- `short_pullback`: original hourly EMA20 recross in EMA100 trend/slope; stop 1.5 ATR14, take 1 ATR14, 4h maximum.
- `short_range`: original hourly range filter and z-score entry; stop 1.5 ATR14, take 1 ATR14, 4h maximum.

The existing 0.25% risk budget, 1/3-equity notional per symbol, no leverage, minimum quantities, next-open entries, and minute execution continue. Test all three predefined cost scenarios. The two-to-one win/loss objective refers to **net** profitable trades. Never optimize win rate alone.

These reused historical periods remain exploratory. The maximum drawdown goal is 5%, not a guarantee or hard shutdown implemented here. Funding is still excluded and unknown.
