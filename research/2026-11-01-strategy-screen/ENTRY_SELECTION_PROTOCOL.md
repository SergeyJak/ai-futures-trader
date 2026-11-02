# Eighth frozen experiment: selective entry in sustained directional movement

User clarified that constant market exposure is unnecessary: find a suitable entry and remain in cash otherwise. Original rules already only enter on signals. Test one additional causal entry filter, not a new rule for retrospectively removing losing trades.

For each original trend-breakout signal, compute Kaufman-style efficiency over the last 20 completed-bar close changes:

`efficiency = abs(log(close[j]/close[j-20])) / sum(abs(diff(log(close[j-20:j+1]))))`.

Require efficiency >=0.40, fixed before calculation. Low efficiency means the path was mostly back-and-forth; high efficiency means more sustained directional travel. This is a hypothesis about pre-entry behavior, not proof of predictive advantage.

Compare 1h and 4h signal timeframes, same original exits and `risk1_gross3` policy (1% modeled risk, per-symbol notional <=equity, total <=3x). Test full original history and a separate October account starting at 100 USDT. Run three cost scenarios and report every result. No searching a threshold grid or selecting a new threshold after October outcomes.

Measure approximate time with at least one position from recorded model intervals, number of signals/entries, net, monthly returns and drawdown. Fewer trades, no losing trades in a tiny sample, or more time in cash do not establish +10% monthly profitability. October is already inspected and is not an untouched holdout.

Do not change the already frozen forward protocol automatically. This filter is a separately versioned research hypothesis; future account rules must be explicit before new data are evaluated.
