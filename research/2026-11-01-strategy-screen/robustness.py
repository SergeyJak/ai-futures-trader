"""Descriptive robustness checks on the frozen screen; does not tune rules."""
import csv,json,math
from pathlib import Path
from collections import defaultdict
import numpy as np

ROOT=Path(__file__).resolve().parent
trades=list(csv.DictReader((ROOT/'trades.csv').open()))
equity=list(csv.DictReader((ROOT/'equity-hourly.csv').open()))
results=json.loads((ROOT/'results.json').read_text())
output=[]
for result in results:
    if result['scenario']!='baseline':continue
    strategy=result['strategy'];rows=[t for t in trades if t['strategy']==strategy and t['scenario']=='baseline']
    pnls=sorted([float(t['net']) for t in rows],reverse=True)
    daily={}
    for r in equity:daily[r['time'][:10]]=float(r[strategy])
    values=np.r_[100.,list(daily.values())];returns=values[1:]/values[:-1]-1
    rng=np.random.default_rng(20261101);paths=[];n=len(returns)
    for _ in range(10000):
        starts=rng.integers(0,n-6,size=math.ceil(n/7))
        sample=np.concatenate([returns[i:i+7] for i in starts])[:n]
        paths.append(float(np.prod(1+sample)-1)*100)
    # Synthetic all-paid carry, at most ceil(duration/8h) funding events.
    # Fixed recorded positions only; this is neither actual funding nor an independent backtest.
    carry=sum(.0001*float(t['quantity'])*(float(t['entry'])+float(t['exit']))/2*math.ceil(float(t['minutes'])/480) for t in rows)
    output.append(dict(strategy=strategy,net=result['net'],without_largest_winner=sum(pnls[1:]),without_three_largest=sum(pnls[3:]),largest_trade=pnls[0],synthetic_all_paid_carry_001pct_per8h=carry,net_after_synthetic_carry=result['net']-carry,weekly_block_bootstrap_return_pct_95_range=list(np.quantile(paths,[.025,.975])),bootstrap_note='Historical sensitivity using 7-day blocks; not a probability of future profit or an untouched holdout.'))
(ROOT/'robustness.json').write_text(json.dumps(output,indent=2))
for r in output:print(json.dumps(r))
