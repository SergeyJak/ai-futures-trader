"""Purged rolling ridge forecasts; fixed rules; offline cached data only."""
import csv,json,math
import numpy as np
import screen

ROOT=screen.ROOT
HORIZONS=[4,24,48]
FEATURES=['r1','r4','r12','r24','r72','ema20_distance','ema100_distance','ema100_slope12','atr_fraction','range_fraction','log_relative_volume24','log_volume_change','btc_r4','btc_r24','relative_btc_r4','relative_btc_r24']

def lag_return(close,k):
    result=np.zeros(len(close));result[k:]=np.log(close[k:]/close[:-k]);return result

def hourly_volumes(symbol):
    rows=[]
    for p in sorted((ROOT/'data').glob(symbol+'-*.json')):rows.extend(json.loads(p.read_text())['candles'])
    rows.sort(key=lambda r:r['start_at'])
    v=np.array([float(r['volume']) for r in rows]);assert np.all(v>=0)
    return v.reshape(-1,60).sum(axis=1)

def make_features(hours,atrs):
    matrices={};bc=hours['BTCUSDT'][:,4];b4=lag_return(bc,4);b24=lag_return(bc,24)
    for symbol in screen.SYMBOLS:
        bars=hours[symbol];c=bars[:,4];v=hourly_volumes(symbol)[:len(c)]
        e20=screen.ema(c,20);e100=screen.ema(c,100);slope=np.zeros(len(c));slope[12:]=(e100[12:]-e100[:-12])/c[12:]
        rv=np.zeros(len(c));vc=np.zeros(len(c))
        for i in range(24,len(c)):rv[i]=math.log((v[i]+1)/(float(np.median(v[i-24:i]))+1))
        vc[1:]=np.log((v[1:]+1)/(v[:-1]+1))
        returns=[lag_return(c,k) for k in [1,4,12,24,72]]
        x=np.column_stack(returns+[(c-e20)/c,(c-e100)/c,slope,atrs[symbol]/c,(bars[:,2]-bars[:,3])/c,rv,vc,b4,b24,returns[1]-b4,returns[3]-b24])
        assert np.all(np.isfinite(x));matrices[symbol]=x
    return matrices

def forecasts(hours,matrices,atrs,horizon):
    output={};records=[];audit=[]
    for symbol in screen.SYMBOLS:
        bars=hours[symbol];x=matrices[symbol];op=bars[:,1];n=len(op)
        model=None;signals={}
        for j in range(1200,n-1-horizon):
            if model is None or (j-1200)%168==0:
                end=j-horizon-1;start=max(120,end-1080+1)
                indices=np.arange(start,end+1)
                assert np.all(indices+1+horizon<=j)
                y=np.log(op[indices+1+horizon]/op[indices+1])
                mean=x[indices].mean(axis=0);sd=x[indices].std(axis=0);sd=np.where(sd>1e-12,sd,1.)
                xx=np.clip((x[indices]-mean)/sd,-6,6);design=np.column_stack([np.ones(len(indices)),xx])
                penalty=np.eye(design.shape[1])*100;penalty[0,0]=0
                coef=np.linalg.solve(design.T@design+penalty,design.T@y)
                model=(mean,sd,coef,max(.0036,.25*float(np.std(y))),float(y.mean()))
                audit.append(dict(symbol=symbol,horizon=horizon,prediction_time=screen.iso(bars[j,0]+3600),latest_training_feature=screen.iso(bars[end,0]+3600),latest_training_label=screen.iso(bars[end+1+horizon,0]),training_rows=len(indices)))
            mean,sd,coef,threshold,baseline=model
            row=np.r_[1.,np.clip((x[j]-mean)/sd,-6,6)];prediction=float(row@coef)
            time=int(bars[j,0])+3600
            if abs(prediction)>=threshold:signals[time]=(1 if prediction>0 else -1,float(atrs[symbol][j]),None)
            truth=float(np.log(op[j+1+horizon]/op[j+1]))
            records.append(dict(symbol=symbol,horizon=horizon,signal_time=screen.iso(time),forecast=prediction,truth=truth,mean_baseline=baseline,threshold=threshold,signal=abs(prediction)>=threshold))
        output[symbol]=signals
    return output,records,audit

if __name__=='__main__':
    screen.engine_checks();data,hours,signals,atrs=screen.load_data();x=make_features(hours,atrs)
    results=[];trades=[];prediction_rows=[];audits=[];metrics=[]
    for h in HORIZONS:
        forecast,records,audit=forecasts(hours,x,atrs,h)
        key='ridge_'+str(h)+'h'
        for symbol in screen.SYMBOLS:signals[symbol][key]=forecast[symbol]
        # Withholding the final 300 hours must leave all shared earlier forecasts unchanged.
        prefix_hours={s:bars[:-300] for s,bars in hours.items()};prefix_atr={s:v[:-300] for s,v in atrs.items()}
        prefix_x=make_features(prefix_hours,prefix_atr)
        assert all(np.array_equal(prefix_x[s],x[s][:-300]) for s in screen.SYMBOLS)
        pf,pr,_=forecasts(prefix_hours,prefix_x,prefix_atr,h)
        full_map={(r['symbol'],r['signal_time']):r['forecast'] for r in records}
        assert all(abs(r['forecast']-full_map[(r['symbol'],r['signal_time'])])<1e-14 for r in pr)
        for symbol in screen.SYMBOLS:
            rr=[r for r in records if r['symbol']==symbol];pred=np.array([r['forecast'] for r in rr]);truth=np.array([r['truth'] for r in rr]);base=np.array([r['mean_baseline'] for r in rr])
            m=dict(symbol=symbol,horizon=h,n=len(rr),signals=len(forecast[symbol]),mae=float(np.mean(abs(pred-truth))),baseline_mae=float(np.mean(abs(base-truth))),rmse=float(np.sqrt(np.mean((pred-truth)**2))),baseline_rmse=float(np.sqrt(np.mean((base-truth)**2))),correlation=float(np.corrcoef(pred,truth)[0,1]))
            metrics.append(m);print('FORECAST',json.dumps(m),flush=True)
        prediction_rows.extend(records);audits.extend(audit)
        for scenario in screen.SCENARIOS:
            result,rows,_,_=screen.simulate(data,hours,signals,atrs,key,scenario)
            results.append(result);trades.extend(rows);print('TRADING',json.dumps(result),flush=True)
    (ROOT/'learning-results.json').write_text(json.dumps(results,indent=2))
    (ROOT/'forecast-metrics.json').write_text(json.dumps(metrics,indent=2))
    (ROOT/'learning-audit.json').write_text(json.dumps(audits,indent=2))
    for name,rows in [('learning-trades.csv',trades),('forecast-predictions.csv',prediction_rows)]:
        if rows:
            with (ROOT/name).open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    print('PASS: training labels strictly precede each decision; scaling only on train; forecast prefix invariance; sizing, execution and cash/cost checks.',flush=True)
