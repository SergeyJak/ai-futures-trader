"""Fixed ETH/SOL pairs hypothesis; offline, no production writes or orders."""
import csv,json,math
from collections import Counter
import numpy as np
import screen

ROOT=screen.ROOT

def pair_signals(eth,sol):
    x=np.log(sol[:,4]);y=np.log(eth[:,4]);out={};counts=Counter()
    for j in range(168,len(x)):
        xx=x[j-168:j];yy=y[j-168:j]
        vx=xx-xx.mean();vy=yy-yy.mean();den=float(vx@vx)
        if den<=0:counts['zero_variance']+=1;continue
        beta=float(vx@vy/den)
        if not .25<=beta<=4:counts['beta_filter']+=1;continue
        rho=float(np.corrcoef(np.diff(xx),np.diff(yy))[0,1])
        if not np.isfinite(rho) or rho<.5:counts['return_correlation']+=1;continue
        intercept=float(yy.mean()-beta*xx.mean());u=yy-intercept-beta*xx
        lag=u[:-1]-u[:-1].mean();du=np.diff(u);den=float(lag@lag)
        k=float(lag@(du-du.mean())/den) if den>0 else 0
        half_life=math.log(2)/(-k) if k<0 else float('inf')
        if not 1<=half_life<=12:counts['half_life_filter']+=1;continue
        sigma=float(np.std(u,ddof=1))
        if sigma<=0:counts['zero_sigma']+=1;continue
        current=float(y[j]-intercept-beta*x[j]);z=current/sigma
        if abs(z)<2.5:counts['z_filter']+=1;continue
        if abs(current)<3*.0018*(1+beta):counts['insufficient_move_vs_cost']+=1;continue
        out[int(eth[j,0])+3600]=dict(beta=beta,intercept=intercept,sigma=sigma,z=z,sign=1 if current>0 else -1,half_life=half_life)
    return out,dict(counts)

def choose_size(eq,pe,ps,signal,fee,slip):
    beta=signal['beta'];deth=-signal['sign'];dsol=-deth
    ee=pe*(1+deth*slip);es=ps*(1+dsol*slip)
    maximum=eq*.8/(1+beta)
    for ne in range(math.floor(maximum/ee/.01+1e-10),0,-1):
        qe=ne*.01;ns=math.floor((beta*qe*ee/es)/.1+1e-10)
        if ns<1:continue
        qs=ns*.1;eth_notional=qe*ee;sol_notional=qs*es;total=eth_notional+sol_notional
        mismatch=abs(sol_notional/eth_notional-beta)/beta
        if mismatch>.1:continue
        # First-order residual-widening approximation plus modeled two-way execution costs.
        risk=eth_notional*math.expm1(signal['sigma'])+2*(fee+slip)*total
        if total>eq*.8+1e-9 or risk>eq*.0025+1e-9:continue
        assert mismatch<=.1+1e-9
        return dict(qe=qe,qs=qs,ee=ee,es=es,de=deth,ds=dsol,estimated_risk=risk,total_notional=total)
    return None

def simulate_pair(data,signals,scenario):
    eth,sol=data['ETHUSDT'],data['SOLUSDT'];fee,slip=screen.SCENARIOS[scenario]
    cash=100.;position=None;pending_exit=None;trades=[];curve=[];skips=Counter();risk_checks=[]
    def equity(i,col):
        if position is None:return cash
        p=position;xe=eth[i,col]*(1-p['de']*slip);xs=sol[i,col]*(1-p['ds']*slip)
        return cash+p['qe']*p['de']*(xe-p['ee'])+p['qs']*p['ds']*(xs-p['es'])-fee*(p['qe']*xe+p['qs']*xs)
    def close(i,col,t,reason):
        nonlocal cash,position
        p=position;re=float(eth[i,col]);rs=float(sol[i,col]);xe=re*(1-p['de']*slip);xs=rs*(1-p['ds']*slip)
        gross=p['qe']*p['de']*(xe-p['ee'])+p['qs']*p['ds']*(xs-p['es'])
        exit_fee=fee*(p['qe']*xe+p['qs']*xs);net=gross-exit_fee-p['entry_fee'];cash+=gross-exit_fee
        market=p['qe']*p['de']*(re-p['entry_eth_reference'])+p['qs']*p['ds']*(rs-p['entry_sol_reference'])
        trades.append(dict(scenario=scenario,entry_at=screen.iso(p['entry_at']),exit_at=screen.iso(t),minutes=(t-p['entry_at'])/60,side='SHORT_ETH_LONG_SOL' if p['de']<0 else 'LONG_ETH_SHORT_SOL',beta=p['beta'],sigma=p['sigma'],entry_z=p['z'],half_life=p['half_life'],eth_quantity=p['qe'],sol_quantity=p['qs'],price_gross=market,fees=p['entry_fee']+exit_fee,slippage=market-gross,net=net,reason=reason,estimated_risk=p['estimated_risk'],total_entry_notional=p['total_notional']))
        assert abs(market-(market-gross)-(p['entry_fee']+exit_fee)-net)<1e-8
        position=None
    for i,t0 in enumerate(eth[:,0]):
        t=int(t0);exited=False
        if position is not None and (pending_exit or t-position['entry_at']>=14400):
            close(i,1,t,pending_exit or 'TIME');pending_exit=None;exited=True
        signal=signals.get(t)
        if signal is not None:
            if position is not None or exited:skips['already_open_or_just_closed']+=1
            else:
                r=float(math.log(eth[i,1])-signal['intercept']-signal['beta']*math.log(sol[i,1]))
                if r*signal['sign']<=0:skips['already_reverted_at_open']+=1
                else:
                    sized=choose_size(cash,float(eth[i,1]),float(sol[i,1]),signal,fee,slip)
                    if sized is None:skips['minimum_order_hedge_or_risk']+=1
                    else:
                        position=dict(**signal,**sized,entry_at=t,entry_residual=r,entry_eth_reference=float(eth[i,1]),entry_sol_reference=float(sol[i,1]))
                        ef=fee*(sized['qe']*sized['ee']+sized['qs']*sized['es']);position['entry_fee']=ef
                        assert sized['estimated_risk']<=cash*.0025+1e-8
                        assert sized['total_notional']<=cash*.8+1e-8
                        risk_checks.append(dict(equity=cash,estimated_risk=sized['estimated_risk'],notional=sized['total_notional']))
                        cash-=ef
        if position is not None:
            p=position;r=float(math.log(eth[i,4])-p['intercept']-p['beta']*math.log(sol[i,4]))
            # These events are learned at minute close; execution is next open.
            if r*p['sign']<=0:pending_exit='REVERTED'
            elif (r-p['entry_residual'])*p['sign']>=p['sigma']:pending_exit='SPREAD_STOP'
        curve.append(float(equity(i,4)))
    if position is not None:close(len(eth)-1,4,int(eth[-1,0])+60,'END_OF_STUDY')
    curve[-1]=float(cash)
    assert abs(cash-100-sum(t['net'] for t in trades))<1e-8
    assert all(0<=t['minutes']<=240 for t in trades)
    eq=np.array(curve);peaks=np.maximum.accumulate(np.r_[100.,eq]);dd=(peaks[1:]-eq)/peaks[1:]
    monthly=[];prior=100.
    boundaries={}
    for i,t in enumerate(eth[:,0]):boundaries[screen.iso(t)[:7]]=i
    for month,i in boundaries.items():
        end=float(eq[i]);monthly.append(dict(month=month,start_equity=prior,end_equity=end,return_pct=(end/prior-1)*100));prior=end
    positive=sum(max(0.,t['net']) for t in trades);negative=-sum(min(0.,t['net']) for t in trades)
    summary=dict(strategy='eth_sol_relative_value',scenario=scenario,initial=100.,final=float(cash),net=float(cash-100),return_pct=float(cash-100),max_drawdown_pct=float(max(dd)*100),trades=len(trades),wins=sum(bool(t['net']>0) for t in trades),win_rate=sum(bool(t['net']>0) for t in trades)/len(trades) if trades else None,profit_factor=positive/negative if negative else None,price_gross=sum(t['price_gross'] for t in trades),fees=sum(t['fees'] for t in trades),slippage=sum(t['slippage'] for t in trades),median_minutes=float(np.median([t['minutes'] for t in trades])) if trades else None,skips=dict(skips),monthly=monthly,funding='unknown; excluded',execution='minute-close spread event, next-minute-open fills; within-minute excursions unknown')
    return summary,trades,eq

if __name__=='__main__':
    data,hours,_,_=screen.load_data()
    signals,counts=pair_signals(hours['ETHUSDT'],hours['SOLUSDT'])
    for end in [500,1200]:
        prefix,_=pair_signals(hours['ETHUSDT'][:end],hours['SOLUSDT'][:end]);boundary=int(hours['ETHUSDT'][end-1,0])+3600
        assert prefix=={t:s for t,s in signals.items() if t<=boundary}
    print('Pair signals',len(signals),'filters',counts,flush=True)
    results=[];all_trades=[];curves={}
    for scenario in screen.SCENARIOS:
        result,trades,curve=simulate_pair(data,signals,scenario);result['eligible_signals']=len(signals);result['signal_filter_counts']=counts
        results.append(result);all_trades.extend(trades);curves[scenario]=curve
        print(json.dumps(result),flush=True)
    (ROOT/'pair-results.json').write_text(json.dumps(results,indent=2))
    if all_trades:
        with (ROOT/'pair-trades.csv').open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(all_trades[0]));w.writeheader();w.writerows(all_trades)
    with (ROOT/'pair-equity-hourly.csv').open('w',newline='') as f:
        w=csv.writer(f);w.writerow(['time']+list(screen.SCENARIOS))
        for i in range(59,len(data['ETHUSDT']),60):w.writerow([screen.iso(data['ETHUSDT'][i,0])]+[curves[s][i] for s in screen.SCENARIOS])
    print('PASS: signal prefix invariance; fills after observed events; combined risk/notional/hedge constraints; cash/cost reconciliation; <=4h hold.',flush=True)
