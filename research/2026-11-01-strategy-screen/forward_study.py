"""Explicitly invoked read-only replay of the frozen post-2026-11-02 paper account."""
import argparse,datetime as dt,hashlib,json,os,urllib.parse,urllib.request
from pathlib import Path
import numpy as np
import screen

ROOT=Path(__file__).resolve().parent
START=dt.datetime(2026,11,2,tzinfo=dt.timezone.utc)
CACHE_START=dt.datetime(2026,11,1,tzinfo=dt.timezone.utc)
BASE='https://market-collector-production-b906.up.railway.app/api/'

def get(path):
    with urllib.request.urlopen(BASE+path,timeout=30) as r:return json.load(r)

def refresh(cache,end):
    # Keep original frozen research data separate; do not append into its directory.
    manifest=json.loads((ROOT/'data-manifest.json').read_text())
    for item in manifest['files']:
        src=ROOT/'data'/item['file'];dest=cache/item['file']
        if hashlib.sha256(src.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Frozen source changed: '+item['file'])
        if not dest.exists():os.link(src,dest)
    start=CACHE_START
    while start<end:
        stop=min(start+dt.timedelta(days=1),end)
        for symbol in screen.SYMBOLS:
            dest=cache/(symbol+'-'+start.strftime('%Y%m%d')+'.json');old=json.loads(dest.read_text()) if dest.exists() else None
            expected=int((stop-start).total_seconds()/60)
            if old is not None and len(old['candles'])>=expected:continue
            params={'symbol':symbol,'from':start.isoformat(),'to':(stop-dt.timedelta(minutes=1)).isoformat()}
            data=get('trade-candles?'+urllib.parse.urlencode(params))
            if len(data.get('candles',[]))!=expected:raise ValueError('Incomplete candles for '+symbol+' '+start.isoformat())
            if old is not None and data['candles'][:len(old['candles'])]!=old['candles']:raise ValueError('Previously recorded forward candles changed; investigate before replay')
            dest.write_text(json.dumps(data,separators=(',',':')))
        start=stop

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--as-of',help='Exclusive completed UTC boundary; default now rounded down to 4h');parser.add_argument('--refresh',action='store_true',help='Read new confirmed candles from existing app API');args=parser.parse_args()
    now=dt.datetime.now(dt.timezone.utc)
    end=dt.datetime.fromisoformat(args.as_of.replace('Z','+00:00')) if args.as_of else now
    if end.tzinfo is None:raise ValueError('Explicit timezone required')
    end=end.astimezone(dt.timezone.utc)
    if end>now:raise ValueError('Cannot evaluate the future')
    end=dt.datetime.fromtimestamp(int(end.timestamp())//14400*14400,dt.timezone.utc)
    cache_root=ROOT/'forward-cache';cache=cache_root/'data';cache.mkdir(parents=True,exist_ok=True)
    if end<=START:
        report=dict(status='waiting-for-forward-data',start=START.isoformat(),requested_end=end.isoformat(),scheduled=False,orders=False,note='Run explicitly with --refresh after new confirmed candles accumulate.')
        (ROOT/'forward-status.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));return
    if args.refresh:
        available=[]
        for symbol in screen.SYMBOLS:
            rows=get('candles?'+urllib.parse.urlencode({'symbol':symbol,'limit':2}))['candles']
            available.append(max(dt.datetime.fromisoformat(r['start_at'].replace('Z','+00:00')) for r in rows)+dt.timedelta(minutes=1))
        common=min(available);end=min(end,dt.datetime.fromtimestamp(int(common.timestamp())//14400*14400,dt.timezone.utc))
        if end<=START:raise ValueError('No complete common forward block yet')
        refresh(cache,end)
    old_root=screen.ROOT;screen.ROOT=cache_root
    try:data,_,_,_=screen.load_data()
    finally:screen.ROOT=old_root
    data={s:rows[rows[:,0]<end.timestamp()] for s,rows in data.items()}
    if any(rows[-1,0]!=end.timestamp()-60 for rows in data.values()):raise ValueError('Missing data through requested boundary; run --refresh')
    hs={};signals={};atrs={};key='portfolio_trend_4h'
    for symbol,rows in data.items():
        first=np.flatnonzero(rows[:,0]%14400==0)[0];trim=rows[first:];g=trim.reshape(-1,240,5)
        hs[symbol]=np.column_stack([g[:,0,0],g[:,0,1],g[:,:,2].max(axis=1),g[:,:,3].min(axis=1),g[:,-1,4]])
        raw,atrs[symbol]=screen.features(hs[symbol],period_seconds=14400)
        signals[symbol]={key:{t:v for t,v in raw['trend_breakout'].items() if START.timestamp()<=t<end.timestamp()}}
    results=[];trades=[]
    for scenario in screen.SCENARIOS:
        result,rows,_,_=screen.simulate(data,hs,signals,atrs,key,scenario,risk_fraction=.01,symbol_notional_fraction=1.,total_notional_multiple=3.,liquidate_at_end=False)
        result['monthly']=[m for m in result['monthly'] if m['month']>=START.strftime('%Y-%m')]
        result.update(start=START.isoformat(),as_of=end.isoformat(),status='provisional-paper',scheduled=False,orders=False,liquidation='not independently modeled')
        full=[]
        for month in result['monthly']:
            year,number=map(int,month['month'].split('-'));first=dt.datetime(year,number,1,tzinfo=dt.timezone.utc)
            following=dt.datetime(year+1,1,1,tzinfo=dt.timezone.utc) if number==12 else dt.datetime(year,number+1,1,tzinfo=dt.timezone.utc)
            if first>=START and following<=end:full.append(month)
        mean=float((np.prod([m['end_equity']/m['start_equity'] for m in full])**(1/len(full))-1)*100) if full else None
        ready=len(full)>=3 and result['trades']>=30
        result.update(full_calendar_months=len(full),geometric_full_month_return_pct=mean,review_ready=ready,paper_targets_met=bool(ready and all(m['return_pct']>0 for m in full) and mean>=10 and result['max_drawdown_pct']<=15),candidate='not-promoted',unresolved_evidence=['actual funding','margin/liquidation','real execution'])
        results.append(result);trades.extend(rows)
    (ROOT/'forward-results.json').write_text(json.dumps(results,indent=2))
    (ROOT/'forward-trades.json').write_text(json.dumps(trades,indent=2))
    for r in results:print(json.dumps(r))

if __name__=='__main__':main()
