"""Third preregistered screen with a four-hour hard time exit."""
import csv,json
import screen

screen.engine_checks()
data,hours,signals,atrs=screen.load_data()
mapping={'short_breakout':'trend_breakout','short_pullback':'trend_pullback','short_range':'range_reversion'}
for symbol in screen.SYMBOLS:
    for new,base in mapping.items():signals[symbol][new]=signals[symbol][base].copy()
results=[];trades=[]
for strategy in mapping:
    for scenario in screen.SCENARIOS:
        result,rows,_,_=screen.simulate(data,hours,signals,atrs,strategy,scenario)
        assert all(0 <= r['minutes'] <= 240 for r in rows)
        results.append(result);trades.extend(rows)
        print(json.dumps(result),flush=True)
(screen.ROOT/'short-hold-results.json').write_text(json.dumps(results,indent=2))
with (screen.ROOT/'short-hold-trades.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(trades[0]));w.writeheader();w.writerows(trades)
print('PASS: every trade held at most 240 minutes; all model/data checks passed.',flush=True)
