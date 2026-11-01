import concurrent.futures, datetime as dt, json, pathlib, time, urllib.parse, urllib.request

ROOT=pathlib.Path(__file__).resolve().parent
OUT=ROOT/'data'; OUT.mkdir(exist_ok=True)
BASE='https://market-collector-production-b906.up.railway.app/api/trade-candles?'
START=dt.datetime(2026,7,14,2,tzinfo=dt.timezone.utc)
END=dt.datetime(2026,11,1,tzinfo=dt.timezone.utc)

def fetch(task):
    symbol,start,end=task
    path=OUT/(symbol+'-'+start.strftime('%Y%m%d')+'.json')
    if path.exists(): return len(json.loads(path.read_text())['candles'])
    args={'symbol':symbol,'from':start.isoformat(),'to':(end-dt.timedelta(minutes=1)).isoformat()}
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE+urllib.parse.urlencode(args),timeout=30) as r:data=json.load(r)
            if not isinstance(data.get('candles'),list):raise ValueError(str(data)[:100])
            expected=int((end-start).total_seconds()/60)
            if len(data['candles']) != expected:raise ValueError(f'{path.name}: expected {expected}, got {len(data["candles"])}')
            path.write_text(json.dumps(data,separators=(',',':')))
            return expected
        except Exception:
            if attempt==2:raise
            time.sleep(1+attempt)

if __name__=='__main__':
    tasks=[]
    for symbol in ['BTCUSDT','ETHUSDT','SOLUSDT']:
        start=START
        while start<END:
            end=min(start.replace(hour=0)+dt.timedelta(days=1),END)
            tasks.append((symbol,start,end));start=end
    count=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for i,n in enumerate(pool.map(fetch,tasks),1):
            count+=n
            if i%30==0 or i==len(tasks):print(f'{i}/{len(tasks)} windows; {count} candles',flush=True)
