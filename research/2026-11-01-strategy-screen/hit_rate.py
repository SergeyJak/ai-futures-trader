"""Second frozen experiment. Keeps original screen results untouched."""
import csv,json
import screen

screen.engine_checks()
data,hours,signals,atrs=screen.load_data()
original=json.loads((screen.ROOT/'results.json').read_text())
# Refactoring to add the new hypotheses must not change the original baseline.
check,_,_,_=screen.simulate(data,hours,signals,atrs,'trend_breakout','baseline')
expected=next(r for r in original if r['strategy']=='trend_breakout' and r['scenario']=='baseline')
assert check==expected
print('Original trend-breakout baseline unchanged.',flush=True)
mapping={'pullback_short_target':'trend_pullback','range_short_target':'range_reversion'}
for symbol in screen.SYMBOLS:
    for new,base in mapping.items():signals[symbol][new]=signals[symbol][base].copy()
results=[];trades=[]
for strategy in mapping:
    for scenario in screen.SCENARIOS:
        result,rows,_,_=screen.simulate(data,hours,signals,atrs,strategy,scenario)
        results.append(result);trades.extend(rows)
        print(json.dumps(result),flush=True)
(screen.ROOT/'hit-rate-results.json').write_text(json.dumps(results,indent=2))
with (screen.ROOT/'hit-rate-trades.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(trades[0]));w.writeheader();w.writerows(trades)
print('PASS: original baseline unchanged; new simulations passed causal data, cash, costs, sizing, gap and ordering checks.',flush=True)
