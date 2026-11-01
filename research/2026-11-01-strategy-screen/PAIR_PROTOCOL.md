# Fifth frozen experiment: ETH/SOL relative-value reversion

Declared before calculating this hypothesis. Exploratory research on the same historical dataset; no parameter sweep and no claim of a fresh holdout.

Rationale: previous short directional entries had near-zero price edge before costs. Test a different source of edge: temporary relative mispricing between ETH and SOL, rather than the direction of the whole market. Correlation and a fitted mean-reverting residual do not by themselves establish cointegration or executable profit.

Signal, once per completed hour:

- Fit log(ETH) = intercept + beta * log(SOL) on the **previous 168 complete hours**, excluding the signal hour.
- Require beta in [0.25, 4], correlation of the past hourly log returns >=0.5, and descriptive residual AR(1) half-life between 1 and 12 hours. These are fixed filters, not statistical proof of stationarity.
- Compute current residual using that past fit. Enter when |residual / past residual standard deviation| >=2.5.
- Require |residual| >=3 * 0.0018 * (1+beta). This approximates a prospective full-reversion move three times modeled baseline round-trip costs for hedge weights 1:beta. It does not promise that reversion will occur within four hours.
- Positive residual: short ETH, long SOL; negative: long ETH, short SOL. Enter both at the next hour open. Freeze intercept, beta, residual standard deviation and entry state for the position.
- Reject the entry if the next opening prices have already crossed the fitted mean or flipped the sign of the original signal; do not enter a reversion that has already happened.

Sizing and exits:

- Shared account 100 USDT; only one pair open; gross notional <=80% equity; no leverage. Intended notional ratio SOL/ETH = beta.
- Round ETH to .01 and SOL to .1 using existing repo minimums. Search downward from the notional cap for a feasible pair; reject hedge-weight mismatch >10% or ex-ante modeled pair risk >0.25% equity.
- Risk budget uses a protective spread widening of one fitted residual standard deviation from entry plus modeled entry/exit costs. It is an approximation, not a hard bound under asynchronous moves or gaps.
- Exit both legs when frozen residual crosses zero (target), residual widens by one fitted standard deviation in the adverse direction (stop), or four hours elapse. Stops/targets observed at closed minute prices and filled at the following minute open. Thus maximum scheduled hold is four hours, while price gaps, late data and within-minute excursions remain limitations.
- Mark both legs to market every minute, including modeled liquidation costs; report full-equity drawdown. Entry fees deducted at entry, exit fees on closure. The budget applies to the combined pair, not each leg independently.

Run baseline/elevated/severe cost scenarios (.06/.03%, .08/.07%, .10/.15% fee/slippage per side) independently. Funding and borrow/margin/venue constraints are not independently verified; these are USDT perpetual assumptions. Both legs incur costs. Report counts, feasibility rejections, net, fees, slippage, monthly performance, holding time, sensitivity and trade concentration.

Reject as a candidate if it cannot trade feasibly on 100 USDT, lacks enough observations, loses after costs, exceeds the drawdown goal, or fails chronological stability. A positive screen would still require a new forward test and actual funding/spread evidence.
