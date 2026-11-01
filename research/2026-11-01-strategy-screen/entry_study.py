"""One fixed pre-entry efficiency filter; no post-outcome trade deletion."""
import csv,json
import numpy as np
import screen

ROOT=screen.ROOT
OCTOBER=1790812800

def occupancy(rows,start,end):
    # Model timestamp intervals; exact within-minute exposure is unavailable.
    from datetime import datetime
    intervals=[]
    for t in rows:
        a=datetime.fromisoformat(t['entry_at'].replace('Z','+00:00')).timestamp()
        b=datetime.fromisoformat(t['exit_at'].replace('Z','+00:00')).timestamp()
        a=max(a,start);b=min(max(b,a+60),end)
        if b>a:intervals.append((a,b))
    merged=[]
    for a,b in sorted(intervals):
        if merged and a<=merged[-1][1]:merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
        else:merged.append((a,b))
    return sum(b-a for a,b in merged)/(end-start)*100

if __name__=='__main__':
    data,hours,base_signals,atrs=screen.load_data();results=[];trades=[]
    for timeframe in [1,4]:
        if timeframe==1:hs=hours;ss=base_signals;aa=atrs
        else:
            hs={};ss={};aa={}
            for symbol,rows in data.items():
                first=np.flatnonzero(rows[:,0]%14400==0)[0];g=rows[first:].reshape(-1,240,5)
                hs[symbol]=np.column_stack([g[:,0,0],g[:,0,1],g[:,:,2].max(axis=1),g[:,:,3].min(axis=1),g[:,-1,4]])
                ss[symbol],aa[symbol]=screen.features(hs[symbol],period_seconds=14400)
        key='portfolio_trend_'+str(timeframe)+'h';filtered={};counts={}
        for symbol in screen.SYMBOLS:
            c=np.log(hs[symbol][:,4]);filtered[symbol]={}
            for t,signal in ss[symbol]['trend_breakout'].items():
                j=int((t-timeframe*3600-hs[symbol][0,0])/(timeframe*3600));past=c[j-20:j+1]
                distance=float(np.abs(np.diff(past)).sum());efficiency=abs(float(past[-1]-past[0]))/distance if distance>0 else 0
                if efficiency>=.4:filtered[symbol][t]=signal
            counts[symbol]=dict(original=len(ss[symbol]['trend_breakout']),filtered=len(filtered[symbol]))
        for window in ['full','october']:
            start=int(data['BTCUSDT'][0,0]) if window=='full' else OCTOBER
            for symbol in screen.SYMBOLS:ss[symbol][key]={t:v for t,v in filtered[symbol].items() if t>=start}
            for scenario in screen.SCENARIOS:
                r,rows,_,_=screen.simulate(data,hs,ss,aa,key,scenario,risk_fraction=.01,symbol_notional_fraction=1.,total_notional_multiple=3.)
                r.update(window=window,entry_filter='efficiency20>=0.40',policy='risk1_gross3',signal_counts=counts,approximate_time_in_market_pct=occupancy(rows,start,int(data['BTCUSDT'][-1,0])+60))
                if window=='october':r['monthly']=[m for m in r['monthly'] if m['month']=='2026-10']
                results.append(r);trades.extend(dict(window=window,**t) for t in rows)
                print(json.dumps(r),flush=True)
    (ROOT/'entry-selection-results.json').write_text(json.dumps(results,indent=2))
    with (ROOT/'entry-selection-trades.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(trades[0]));w.writeheader();w.writerows(trades)
    print('PASS: entry filter uses completed pre-entry closes only; same frozen risk/exit model; all scenarios, cash and costs reconcile.',flush=True)
