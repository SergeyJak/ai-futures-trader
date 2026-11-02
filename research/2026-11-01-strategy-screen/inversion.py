"""Invert only direction at fixed times/quantities to isolate costs, not a tradable backtest."""
import csv,json
from pathlib import Path
from collections import defaultdict

ROOT=Path(__file__).resolve().parent
groups=defaultdict(list);out=[]
for file in ['trades.csv','hit-rate-trades.csv','short-hold-trades.csv']:
    for t in csv.DictReader((ROOT/file).open()):
        if t['scenario']!='baseline':continue
        d=1 if t['side']=='LONG' else -1
        q,e,x=[float(t[k]) for k in ['quantity','entry','exit']]
        em,xm=e/(1+d*.0003),x/(1-d*.0003)
        ie,ix=em*(1-d*.0003),xm*(1+d*.0003)
        inverse_gross=q*(-d)*(ix-ie)
        inverse_fees=.0006*q*(ie+ix)
        price_gross=float(t['price_gross']);net=float(t['net'])
        inverse_net=inverse_gross-inverse_fees
        original_cost=float(t['slippage'])+float(t['fees'])
        inverse_cost=-price_gross-inverse_gross+inverse_fees
        assert abs(net+inverse_net+original_cost+inverse_cost)<1e-8
        row=dict(strategy=t['strategy'],symbol=t['symbol'],entry_at=t['entry_at'],exit_at=t['exit_at'],original_price_gross=price_gross,original_fees=float(t['fees']),original_slippage=float(t['slippage']),original_net=net,inverse_price_gross=-price_gross,inverse_net=inverse_net,inverse_cost=inverse_cost)
        groups[t['strategy']].append(row);out.append(row)
summaries=[]
for key,rows in groups.items():
    s=dict(strategy=key,trades=len(rows),**{k:sum(r[k] for r in rows) for k in ['original_price_gross','original_fees','original_slippage','original_net','inverse_price_gross','inverse_net','inverse_cost']},both_negative=sum(r['original_net']<0 and r['inverse_net']<0 for r in rows),note='Fixed original timestamps and quantities, no rescheduling or compounding; counterfactual cost attribution only.')
    summaries.append(s);print(json.dumps(s))
(ROOT/'inversion-results.json').write_text(json.dumps(summaries,indent=2))
with (ROOT/'inversion-trades.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(out[0]));w.writeheader();w.writerows(out)
