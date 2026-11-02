"""Fixed-rule offline screening of saved candles. Never submits requests or orders."""
import csv, json, math, os
os.environ.setdefault('MPLCONFIGDIR','/tmp/strategy-study-matplotlib')
from pathlib import Path
from datetime import datetime, timezone
import numpy as np

ROOT=Path(__file__).resolve().parent
SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT']
STEPS={'BTCUSDT':.001,'ETHUSDT':.01,'SOLUSDT':.1}
SCENARIOS={'baseline':(.0006,.0003),'elevated':(.0008,.0007),'severe':(.001,.0015)}
STRATEGIES=['trend_breakout','trend_pullback','range_reversion']

def iso(t):return datetime.fromtimestamp(int(t),timezone.utc).isoformat().replace('+00:00','Z')
def ema(x,n):
    out=np.empty(len(x));out[0]=x[0];alpha=2/(n+1)
    for i in range(1,len(x)):out[i]=alpha*x[i]+(1-alpha)*out[i-1]
    return out

def features(hours,period_seconds=3600):
    o,h,l,c=hours[:,1],hours[:,2],hours[:,3],hours[:,4]
    fast,slow=ema(c,20),ema(c,100)
    tr=np.maximum(h-l,np.maximum(np.abs(h-np.roll(c,1)),np.abs(l-np.roll(c,1))));tr[0]=h[0]-l[0]
    atr=np.empty(len(c));atr[0]=tr[0]
    for i in range(1,len(c)):atr[i]=(13*atr[i-1]+tr[i])/14
    signals={k:{} for k in STRATEGIES}
    for i in range(120,len(c)):
        a=atr[i]; slope=slow[i]-slow[i-12]
        if a<=0:continue
        side=1 if c[i]>max(h[i-20:i]) and c[i]>slow[i] and slope>0 else -1 if c[i]<min(l[i-20:i]) and c[i]<slow[i] and slope<0 else 0
        if side:signals['trend_breakout'][int(hours[i,0])+period_seconds]=(side,float(a),None)
        side=1 if c[i-1]<=fast[i-1] and c[i]>fast[i] and c[i]>slow[i] and slope>0 else -1 if c[i-1]>=fast[i-1] and c[i]<fast[i] and c[i]<slow[i] and slope<0 else 0
        if side:signals['trend_pullback'][int(hours[i,0])+period_seconds]=(side,float(a),None)
        if abs(fast[i]-slow[i])<a and abs(slope)<.5*a:
            mean=float(np.mean(c[i-19:i+1]));std=float(np.std(c[i-19:i+1]))
            z=(c[i]-mean)/std if std>0 else 0
            side=1 if z<=-2 else -1 if z>=2 else 0
            if side:signals['range_reversion'][int(hours[i,0])+period_seconds]=(side,float(a),mean)
    return signals,atr

def load_data():
    data={};hours={};sigs={};atrs={}
    for symbol in SYMBOLS:
        rows=[]
        for path in sorted((ROOT/'data').glob(symbol+'-*.json')):
            rows.extend(json.loads(path.read_text())['candles'])
        rows.sort(key=lambda r:r['start_at'])
        arr=np.array([[datetime.fromisoformat(r['start_at'].replace('Z','+00:00')).timestamp(),*[float(r[k]) for k in ['open','high','low','close']]] for r in rows])
        assert len(arr)>150000,(symbol,len(arr))
        assert np.all(np.diff(arr[:,0])==60),symbol
        assert np.all(np.isfinite(arr)) and np.all(arr[:,1:]>0)
        assert np.all(arr[:,3]<=np.minimum(arr[:,1],arr[:,4]))
        assert np.all(arr[:,2]>=np.maximum(arr[:,1],arr[:,4]))
        assert len(set(arr[:,0]))==len(arr)
        assert np.all(arr[:,0]%3600==np.arange(len(arr))%60*60)
        grouped=arr.reshape(-1,60,5)
        hs=np.column_stack([grouped[:,0,0],grouped[:,0,1],grouped[:,:,2].max(axis=1),grouped[:,:,3].min(axis=1),grouped[:,-1,4]])
        data[symbol]=arr;hours[symbol]=hs;sigs[symbol],atrs[symbol]=features(hs)
        # Prefix invariance: adding future candles must not alter earlier decisions/ATR.
        for end in [200,700,len(hs)//2]:
            ps,pa=features(hs[:end]);boundary=int(hs[end-1,0])+3600
            for k in STRATEGIES:assert ps[k]=={t:v for t,v in sigs[symbol][k].items() if t<=boundary}
            assert np.array_equal(pa,atrs[symbol][:end])
    assert all(np.array_equal(data[s][:,0],data[SYMBOLS[0]][:,0]) for s in SYMBOLS)
    return data,hours,sigs,atrs

def protective_exit(p,bar):
    _,op,hi,lo,_=bar;d=p['direction'];stop=p['stop'];take=p['take']
    stop_hit=lo<=stop if d==1 else hi>=stop
    take_hit=take is not None and (hi>=take if d==1 else lo<=take)
    if stop_hit:return (min(stop,op) if d==1 else max(stop,op),'BOTH_STOP_FIRST' if take_hit else 'STOP')
    if take_hit:return take,'TAKE'
    return None

def simulate(data,hours,signals,atrs,strategy,scenario,capital=100.,risk_fraction=.0025,symbol_notional_fraction=1/3,total_notional_multiple=1.,liquidate_at_end=True):
    fee,slip=SCENARIOS[scenario];cash=capital;positions={};trades=[];curve=[];skips={};entry_checks=[]
    times=data[SYMBOLS[0]][:,0]
    def skip(reason):skips[reason]=skips.get(reason,0)+1
    def equity(i,column):
        return cash+sum(p['qty']*p['direction']*(data[s][i,column]*(1-p['direction']*slip)-p['entry'])-fee*p['qty']*data[s][i,column]*(1-p['direction']*slip) for s,p in positions.items())
    def close(symbol,reference,t,reason):
        nonlocal cash
        p=positions.pop(symbol);d=p['direction'];fill=reference*(1-d*slip);q=p['qty']
        gross=q*d*(fill-p['entry']);exit_fee=fee*q*fill;net=gross-p['entry_fee']-exit_fee
        cash+=gross-exit_fee
        market_gross=q*d*(reference-p['entry_reference'])
        trades.append(dict(strategy=strategy,scenario=scenario,symbol=symbol,side='LONG' if d==1 else 'SHORT',entry_at=iso(p['entry_at']),exit_at=iso(t),quantity=q,entry=p['entry'],exit=fill,reason=reason,minutes=(t-p['entry_at'])/60,price_gross=market_gross,slippage=market_gross-gross,fees=p['entry_fee']+exit_fee,net=net))
    for i,t0 in enumerate(times):
        t=int(t0);exited=set()
        # Time exits are known at minute open and precede that minute's high/low.
        for symbol,p in list(positions.items()):
            if t>=p['deadline']:close(symbol,data[symbol][i,1],t,'TIME');exited.add(symbol)
        # All symbols size from contemporaneous opens, never this minute's close.
        for symbol in SYMBOLS:
            signal=signals[symbol][strategy].get(t)
            if signal is None:continue
            if symbol in positions or symbol in exited:skip('already_open_or_exited');continue
            d,atr,target=signal;ref=data[symbol][i,1];entry=ref*(1+d*slip)
            short_target=strategy in ['pullback_short_target','range_short_target','short_breakout','short_pullback','short_range']
            stop=entry*(1-d*.004) if strategy=='volume_breakout_4h' else entry-d*(1.5 if short_target else 2)*atr
            if stop<=0:skip('invalid_stop');continue
            take=entry*(1+d*.008) if strategy=='volume_breakout_4h' else entry+d*atr if short_target else entry+d*3*atr if strategy=='trend_pullback' else target if strategy=='range_reversion' else None
            if take is not None and d*(take-entry)<=0:skip('target_wrong_side_after_gap');continue
            eq=equity(i,1);used=sum(p['qty']*data[s][i,1] for s,p in positions.items())
            available=max(0.,eq*total_notional_multiple-used)
            loss_per_unit=d*(entry-stop*(1-d*slip))+fee*(entry+stop*(1-d*slip))
            raw=min(eq*risk_fraction/loss_per_unit,eq*symbol_notional_fraction/entry,available/(entry*(1+fee)))
            step=STEPS[symbol];qty=math.floor(raw/step+1e-10)*step
            if qty<step-1e-10:skip(symbol+':minimum_order');continue
            assert qty*loss_per_unit <= eq*risk_fraction+1e-8
            assert qty*entry <= eq*symbol_notional_fraction+1e-8
            assert used+qty*entry <= eq*total_notional_multiple+1e-8
            entry_fee=fee*qty*entry;cash-=entry_fee
            horizon={'trend_breakout':48,'trend_pullback':24,'range_reversion':12,'pullback_short_target':12,'range_short_target':12,'short_breakout':4,'short_pullback':4,'short_range':4,'volume_breakout_4h':4,'ridge_4h':4,'ridge_24h':24,'ridge_48h':48,'portfolio_trend_1h':48,'portfolio_trend_4h':168}[strategy]
            positions[symbol]=dict(qty=qty,direction=d,entry=entry,entry_reference=ref,entry_fee=entry_fee,entry_at=t,stop=stop,take=take,deadline=t+horizon*3600,extreme=entry)
            entry_checks.append(dict(symbol=symbol,time=iso(t),equity=eq,notional=qty*entry,modeled_stop_loss=qty*loss_per_unit))
        for symbol,p in list(positions.items()):
            decision=protective_exit(p,data[symbol][i])
            if decision:close(symbol,decision[0],t,decision[1]);exited.add(symbol)
        # Hour-close trailing updates affect only the next minute and beyond.
        trail_period=14400 if strategy=='portfolio_trend_4h' else 3600
        if (t+60)%trail_period==0 and strategy in ['trend_breakout','portfolio_trend_1h','portfolio_trend_4h']:
            for symbol,p in positions.items():
                hi=int((t-hours[symbol][0,0])//trail_period)
                c=data[symbol][i,4];d=p['direction'];p['extreme']=max(p['extreme'],c) if d==1 else min(p['extreme'],c)
                candidate=p['extreme']-d*3*atrs[symbol][hi]
                p['stop']=max(p['stop'],candidate) if d==1 else min(p['stop'],candidate)
        curve.append(equity(i,4))
    if liquidate_at_end:
        for symbol in list(positions):close(symbol,data[symbol][-1,4],int(times[-1])+60,'END_OF_STUDY')
        curve[-1]=cash
    open_entry_fees=sum(p['entry_fee'] for p in positions.values())
    assert abs(cash-capital-sum(t['net'] for t in trades)+open_entry_fees)<1e-7
    assert all(abs(t['price_gross']-t['slippage']-t['fees']-t['net'])<1e-8 for t in trades)
    arr=np.array(curve);peaks=np.maximum.accumulate(np.r_[capital,arr]);dd=(peaks[1:]-arr)/peaks[1:]
    wins=sum(max(0,t['net']) for t in trades);loss=-sum(min(0,t['net']) for t in trades)
    monthly=[];previous=capital
    months=sorted(set(iso(t)[:7] for t in times))
    for month in months:
        idx=np.flatnonzero(np.array([iso(t)[:7]==month for t in times]));end=float(arr[idx[-1]])
        monthly.append(dict(month=month,start_equity=previous,end_equity=end,return_pct=(end/previous-1)*100,pnl=end-previous));previous=end
    summary=dict(strategy=strategy,scenario=scenario,initial=capital,final=cash,net=cash-capital,return_pct=(cash/capital-1)*100,max_drawdown_pct=float(max(dd))*100,trades=len(trades),wins=sum(bool(t['net']>0) for t in trades),profit_factor=wins/loss if loss else None,fees=sum(t['fees'] for t in trades),slippage=sum(t['slippage'] for t in trades),price_gross=sum(t['price_gross'] for t in trades),end_liquidations=sum(t['reason']=='END_OF_STUDY' for t in trades),funding='excluded; unknown',skips=skips,monthly=monthly,symbols={s:dict(trades=sum(t['symbol']==s for t in trades),net=sum(t['net'] for t in trades if t['symbol']==s)) for s in SYMBOLS})
    if not liquidate_at_end:
        summary.update(mode='prospective-paper-replay',cash=float(cash),equity=float(arr[-1]),final=float(arr[-1]),net=float(arr[-1]-capital),return_pct=float((arr[-1]/capital-1)*100),open_positions={s:dict(quantity=p['qty'],side='LONG' if p['direction']==1 else 'SHORT',entry=p['entry'],entry_at=iso(p['entry_at']),stop=p['stop'],deadline=iso(p['deadline'])) for s,p in positions.items()},closed_realized_net=sum(t['net'] for t in trades),open_entry_fees=float(open_entry_fees))
    return summary,trades,arr,entry_checks

def engine_checks():
    p={'direction':1,'stop':90.,'take':110.}
    assert protective_exit(p,[0,100,115,85,100])==(90.,'BOTH_STOP_FIRST')
    assert protective_exit(p,[0,80,85,75,82])==(80,'STOP')
    p={'direction':-1,'stop':110.,'take':90.}
    assert protective_exit(p,[0,120,125,115,122])==(120,'STOP')
    assert protective_exit(p,[0,100,115,85,100])==(110.,'BOTH_STOP_FIRST')
    # Flat price round trip must lose exactly two fees plus adverse fills.
    q,reference,fee,slip=1.,100.,.0006,.0003
    e,x=reference*(1+slip),reference*(1-slip)
    assert abs(q*(x-e)-fee*q*(e+x)+.18)<1e-10

if __name__=='__main__':
    engine_checks();data,hours,signals,atrs=load_data()
    print('Data verified:',{s:len(v) for s,v in data.items()},flush=True)
    summaries=[];all_trades=[];curves={};checks=[]
    for strategy in STRATEGIES:
        for scenario in SCENARIOS:
            summary,trades,curve,entries=simulate(data,hours,signals,atrs,strategy,scenario)
            summaries.append(summary);all_trades.extend(trades);checks.extend(dict(strategy=strategy,scenario=scenario,**e) for e in entries)
            if scenario=='baseline':curves[strategy]=curve
            print(json.dumps(summary),flush=True)
    (ROOT/'results.json').write_text(json.dumps(summaries,indent=2))
    for name,rows in [('trades.csv',all_trades),('risk-checks.csv',checks)]:
        if rows:
            with (ROOT/name).open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    times=data[SYMBOLS[0]][:,0]
    with (ROOT/'equity-hourly.csv').open('w',newline='') as f:
        w=csv.writer(f);w.writerow(['time']+STRATEGIES)
        for i in range(59,len(times),60):w.writerow([iso(times[i])]+[curves[s][i] for s in STRATEGIES])
    import matplotlib;matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,ax=plt.subplots(figsize=(11,5))
    x=[datetime.fromtimestamp(t,timezone.utc) for t in times[59::60]]
    for s in STRATEGIES:ax.plot(x,curves[s][59::60],label=s)
    ax.axhline(100,color='gray',lw=.7);ax.set_ylabel('Equity, USDT (funding excluded)');ax.set_title('Fixed rules, 100 USDT, baseline modeled costs');ax.legend();fig.autofmt_xdate();fig.tight_layout();fig.savefig(ROOT/'equity.png',dpi=160)
    print('PASS: candle continuity/OHLC, causal prefix invariance, gap/stop ordering, fees, risk sizing, cash and cost reconciliation.',flush=True)
