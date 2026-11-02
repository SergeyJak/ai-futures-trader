"""One preregistered volume-confirmed breakout. Reads saved candles only."""
import csv,json
from datetime import datetime
import numpy as np
import screen

screen.engine_checks()
data,hours,signals,atrs=screen.load_data()
strategy='volume_breakout_4h'
signal_counts={}
for symbol in screen.SYMBOLS:
    rows=[]
    for path in sorted((screen.ROOT/'data').glob(symbol+'-*.json')):rows.extend(json.loads(path.read_text())['candles'])
    rows.sort(key=lambda r:r['start_at'])
    t=np.array([datetime.fromisoformat(r['start_at'].replace('Z','+00:00')).timestamp() for r in rows])
    assert np.array_equal(t,data[symbol][:,0])
    volumes=np.array([float(r['volume']) for r in rows]);assert np.all(np.isfinite(volumes)) and np.all(volumes>=0)
    hourly=volumes.reshape(-1,60).sum(axis=1)
    filtered={}
    for time,signal in signals[symbol]['trend_breakout'].items():
        i=int((time-3600-hours[symbol][0,0])/3600)
        baseline=float(np.median(hourly[i-20:i]))
        if baseline>0 and hourly[i]>=1.5*baseline:filtered[time]=signal
    signals[symbol][strategy]=filtered
    signal_counts[symbol]={'unfiltered':len(signals[symbol]['trend_breakout']),'volume_confirmed':len(filtered)}
print('Signals:',json.dumps(signal_counts),flush=True)
results=[];trades=[];curves={}
for scenario in screen.SCENARIOS:
    result,rows,curve,_=screen.simulate(data,hours,signals,atrs,strategy,scenario)
    assert all(0<=r['minutes']<=240 for r in rows)
    result['signal_counts']=signal_counts
    results.append(result);trades.extend(rows);curves[scenario]=curve
    print(json.dumps(result),flush=True)
(screen.ROOT/'volume-results.json').write_text(json.dumps(results,indent=2))
with (screen.ROOT/'volume-trades.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(trades[0]));w.writeheader();w.writerows(trades)
with (screen.ROOT/'volume-equity-hourly.csv').open('w',newline='') as f:
    w=csv.writer(f);w.writerow(['time']+list(screen.SCENARIOS))
    for i in range(59,len(t),60):w.writerow([screen.iso(t[i])]+[curves[s][i] for s in screen.SCENARIOS])
print('PASS: volume reference excludes current/future hours; complete timestamp alignment; all trades <=240 minutes; causal features, sizing, cash and cost checks passed.',flush=True)
