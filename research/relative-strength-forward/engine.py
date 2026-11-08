"""Read-only fixed basket replay; no exchange orders. Prices are trade, not mark OHLC."""
import json,pathlib,math,datetime as dt
HOUR=3600000;DAY=24*HOUR
SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','LINKUSDT']

def select_basket(daily, day):
    ranked=[]
    for s,rows in daily.items():
        prior=[r for r in rows if r[0]<day]
        if not prior or prior[-1][0]!=day-DAY:raise ValueError('Stale daily signal: '+s)
        if len(prior)<29 or sum(float(r[7]) for r in prior[-7:])/7<5e7:continue
        if any(b[0]-a[0]!=DAY for a,b in zip(prior[-29:],prior[-28:])):continue
        ranked.append((float(prior[-1][4])/float(prior[-29][4])-1,s))
    ranked.sort()
    if len(ranked)<4:return {}
    return dict([(s,1) for _,s in ranked[:2]]+[(s,-1) for _,s in ranked[-2:]])

def execution_cost(delta,price,fee,slip):
    return abs(delta)*price*(fee+slip+fee*slip)

def replay(daily,hourly,funding,rules,start,end,fee=.0006,slip=.0003,liquidate_at_end=True,initial_capital=100.):
    if not math.isfinite(initial_capital) or initial_capital<=0:raise ValueError('Invalid initial capital')
    if set(daily)!=set(SYMBOLS):raise ValueError('Unexpected symbol universe')
    times=list(range(start,end+HOUR,HOUR))
    for s in SYMBOLS:
        if not all(t in hourly[s] for t in times):raise ValueError('Missing hourly candle: '+s)
    cash=float(initial_capital);positions={};peak=float(initial_capital);dd=0.;bound=0.;gross_peak=0.;events=[];curve=[];decisions=[];fundtotal=0.;costtotal=0.
    for t in times:
        opens={s:float(hourly[s][t][1]) for s in SYMBOLS}
        # Settlements occur before any execution in this hour. Rebalances at01UTC
        # never coincide with the8h schedule verified in the input.
        if t%(8*HOUR)==0:
            for s,(q,entry) in positions.items():
                if t not in funding[s]:raise ValueError('Missing funding: '+s+' '+str(t))
                rate,mark=funding[s][t];amount=-q*rate*mark;cash+=amount;fundtotal+=amount
                events.append(dict(at=t,kind='funding',symbol=s,amount=amount))
        if (t==end and liquidate_at_end) or (t!=end and t%DAY==HOUR):
            wanted={} if t==end else select_basket(daily,t//DAY*DAY)
            held={s:1 if q>0 else -1 for s,(q,entry) in positions.items()}
            if wanted!=held:
                # Close whole basket on membership change: explicit conservative turnover.
                for s,(q,entry) in list(positions.items()):
                    cost=execution_cost(q,opens[s],fee,slip)
                    realized=q*(opens[s]-entry);cash+=realized-cost;costtotal+=cost
                    events.append(dict(at=t,kind='close',symbol=s,quantity=q,price=opens[s],cost=cost,realized=realized))
                positions={};targets={};reason=None
                budget=cash/(1+2*(fee+slip+fee*slip))
                for s,side in wanted.items():
                    f=rules[s]['MARKET_LOT_SIZE'];step=float(f['stepSize'])
                    q=math.floor(.25*budget/opens[s]/step+1e-9)*step
                    if q<float(f['minQty']) or q>float(f['maxQty']) or q*opens[s]<float(rules[s]['MIN_NOTIONAL']['notional']):reason='minimum_or_maximum_order:'+s;break
                    targets[s]=side*q
                if reason:targets={}
                for s,q in targets.items():
                    cost=execution_cost(q,opens[s],fee,slip);cash-=cost;costtotal+=cost
                    positions[s]=(q,opens[s]);events.append(dict(at=t,kind='open',symbol=s,quantity=q,price=opens[s],cost=cost))
                decisions.append(dict(at=t,wanted=wanted,entered=list(targets),rejected=reason))
        # END at open: no look into the hour after report boundary.
        column=1 if t==end else 4
        prices={s:float(hourly[s][t][column]) for s in SYMBOLS}
        unreal=sum(q*(prices[s]-entry) for s,(q,entry) in positions.items())
        exitcost=sum(execution_cost(q,prices[s],fee,slip) for s,(q,e) in positions.items())
        equity=cash+unreal-exitcost;peak=max(peak,equity);dd=max(dd,1-equity/peak)
        gross=sum(abs(q)*prices[s] for s,(q,e) in positions.items());gross_peak=max(gross_peak,gross/equity if equity>0 else math.inf)
        worst=equity if t==end else cash+sum(q*(float(hourly[s][t][3 if q>0 else 2])-entry)-execution_cost(q,float(hourly[s][t][3 if q>0 else 2]),fee,slip) for s,(q,entry) in positions.items())
        if t!=end:bound=max(bound,1-worst/peak)
        curve.append(dict(at=t,equity=equity,gross_multiple=gross/equity if equity>0 else None,positions={s:q for s,(q,e) in positions.items()}))
    if liquidate_at_end:assert not positions
    months={};prev=float(initial_capital)
    for p in curve:
        # Hour-close return assigned to its starting UTC date.
        month=dt.datetime.fromtimestamp(p['at']/1000,dt.timezone.utc).strftime('%Y-%m')
        months[month]=months.get(month,1)*p['equity']/prev;prev=p['equity']
    return dict(fee=fee,slip=slip,final=equity,cash=cash,net=equity-initial_capital,initial_capital=initial_capital,dd_hourly_pct=100*dd,simultaneous_hour_extremes_bound_pct=100*bound,peak_gross_multiple=gross_peak,funding=fundtotal,costs=costtotal,monthly={m:100*(v-1) for m,v in months.items()},events=events,curve=curve,decisions=decisions)

