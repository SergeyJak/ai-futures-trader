"""Standalone October 100 USDT account, same frozen trend/risk policies."""
import csv,json
from datetime import datetime,timezone
import numpy as np
import screen
from portfolio_study import POLICIES
from entry_study import occupancy

ROOT=screen.ROOT
START=int(datetime(2026,10,1,tzinfo=timezone.utc).timestamp())
END=int(datetime(2026,11,1,tzinfo=timezone.utc).timestamp())

if __name__=='__main__':
    screen.engine_checks();data,hours,base_signals,atrs=screen.load_data()
    assert all(rows[-1,0]==END-60 for rows in data.values())
    results=[];trades=[]
    for timeframe in [1,4]:
        if timeframe==1:hs=hours;ss=base_signals;aa=atrs
        else:
            hs={};ss={};aa={}
            for symbol,rows in data.items():
                first=np.flatnonzero(rows[:,0]%14400==0)[0];g=rows[first:].reshape(-1,240,5)
                hs[symbol]=np.column_stack([g[:,0,0],g[:,0,1],g[:,:,2].max(axis=1),g[:,:,3].min(axis=1),g[:,-1,4]])
                ss[symbol],aa[symbol]=screen.features(hs[symbol],period_seconds=14400)
        key='portfolio_trend_'+str(timeframe)+'h'
        for symbol in screen.SYMBOLS:ss[symbol][key]={t:v for t,v in ss[symbol]['trend_breakout'].items() if START<=t<END}
        for policy,(risk,notional,gross) in POLICIES.items():
            for scenario in screen.SCENARIOS:
                r,rows,_,_=screen.simulate(data,hs,ss,aa,key,scenario,risk_fraction=risk,symbol_notional_fraction=notional,total_notional_multiple=gross)
                assert all(START<=datetime.fromisoformat(t['entry_at'].replace('Z','+00:00')).timestamp()<END for t in rows)
                assert len([m for m in r['monthly'] if m['month']=='2026-10'])==1
                october=next(m for m in r['monthly'] if m['month']=='2026-10')
                assert abs(october['start_equity']-100)<1e-10
                assert abs(october['return_pct']-r['return_pct'])<1e-10
                r.update(policy=policy,start='2026-10-01T00:00:00Z',end_exclusive='2026-11-01T00:00:00Z',risk_fraction=risk,max_gross_multiple=gross,target_10pct_met=bool(r['return_pct']>=10),liquidation='not independently modeled',approximate_time_in_market_pct=occupancy(rows,START,END))
                r['monthly']=[october];results.append(r);trades.extend(dict(policy=policy,**t) for t in rows)
                print(json.dumps(r),flush=True)
    (ROOT/'october-results.json').write_text(json.dumps(results,indent=2))
    with (ROOT/'october-trades.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(trades[0]));w.writeheader();w.writerows(trades)
    print('PASS: October starts at 100 with no inherited trades; all entries after cutoff; fees/cash/risk policy and month-return checks passed.',flush=True)
