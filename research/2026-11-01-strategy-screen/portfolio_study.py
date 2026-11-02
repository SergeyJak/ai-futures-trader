"""Bounded preregistered trend/risk search for the user's monthly target."""
import csv,json
import numpy as np
import screen

ROOT=screen.ROOT
POLICIES={
 'risk025_gross1':(.0025,1/3,1.),
 'risk1_gross1':(.01,1/3,1.),
 'risk1_gross3':(.01,1.,3.),
 'risk2_gross3':(.02,1.,3.)
}

if __name__=='__main__':
    screen.engine_checks();data,hours,base_signals,atrs=screen.load_data()
    original=json.loads((ROOT/'results.json').read_text())
    expected=next(r for r in original if r['strategy']=='trend_breakout' and r['scenario']=='baseline')
    check,_,_,_=screen.simulate(data,hours,base_signals,atrs,'trend_breakout','baseline')
    assert check==expected
    print('Original baseline unchanged.',flush=True)
    results=[];all_trades=[]
    for timeframe in [1,4]:
        if timeframe==1:hs=hours;ss=base_signals;aa=atrs
        else:
            hs={};ss={};aa={}
            for symbol,rows in data.items():
                start=np.flatnonzero(rows[:,0]%(4*3600)==0)[0]
                trimmed=rows[start:];trimmed=trimmed[:len(trimmed)//240*240];g=trimmed.reshape(-1,240,5)
                hs[symbol]=np.column_stack([g[:,0,0],g[:,0,1],g[:,:,2].max(axis=1),g[:,:,3].min(axis=1),g[:,-1,4]])
                ss[symbol],aa[symbol]=screen.features(hs[symbol],period_seconds=14400)
                prefix,pa=screen.features(hs[symbol][:-100],period_seconds=14400)
                cutoff=int(hs[symbol][-101,0])+14400
                assert prefix['trend_breakout']=={t:v for t,v in ss[symbol]['trend_breakout'].items() if t<=cutoff}
                assert np.array_equal(pa,aa[symbol][:-100])
        strategy='portfolio_trend_'+str(timeframe)+'h'
        for symbol in screen.SYMBOLS:ss[symbol][strategy]=ss[symbol]['trend_breakout']
        for policy,(risk,notional,gross) in POLICIES.items():
            for scenario in screen.SCENARIOS:
                result,trades,_,_=screen.simulate(data,hs,ss,aa,strategy,scenario,risk_fraction=risk,symbol_notional_fraction=notional,total_notional_multiple=gross)
                full=[m for m in result['monthly'] if m['month'] in ['2026-08','2026-09','2026-10']]
                avg=float((np.prod([m['end_equity']/m['start_equity'] for m in full])**(1/len(full))-1)*100)
                result.update(policy=policy,risk_fraction=risk,max_gross_multiple=gross,geometric_full_month_return_pct=avg,worst_full_month_pct=min(m['return_pct'] for m in full),full_months_at_least_10pct=sum(m['return_pct']>=10 for m in full),full_months=len(full),liquidation='not independently modeled',candidate='not promoted')
                results.append(result);all_trades.extend(dict(policy=policy,**t) for t in trades)
                print(json.dumps(result),flush=True)
    (ROOT/'portfolio-results.json').write_text(json.dumps(results,indent=2))
    with (ROOT/'portfolio-trades.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(all_trades[0]));w.writeheader();w.writerows(all_trades)
    print('PASS: unchanged original baseline; complete 4h bars; causal prefix invariance; risk/notional policy constraints; cash/cost accounting.',flush=True)
