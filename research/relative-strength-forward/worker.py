"""Bounded public-data downloader for the frozen replay; no credentials/orders."""
import argparse, datetime as dt, hashlib, json, pathlib, sys, tempfile, time
import urllib.request, urllib.parse, urllib.error
from engine import HOUR, DAY, SYMBOLS, replay
from replay import load_packet
START=int(dt.datetime(2026,11,9,1,tzinfo=dt.timezone.utc).timestamp()*1000)
INITIAL_CAPITAL=1000.

BASE='https://fapi.binance.com'
MAX_DAYS=180

def public_get(path, params):
    time.sleep(.15)
    url=BASE+path+'?'+urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            raw=response.read(8*1024*1024+1)
            if len(raw)>8*1024*1024:raise ValueError('Oversized Binance response')
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        raise ValueError('Binance HTTP '+str(e.code)) from None
    except (urllib.error.URLError,TimeoutError):
        raise ValueError('Binance connection unavailable') from None

def candle_rows(get,symbol,interval,start,end,cached):
    step=DAY if interval=='1d' else HOUR
    # A previous report's endpoint candle was still forming: replace it.
    rows=[r for r in cached[:-1] if start<=r[0]<=end] if cached else []
    cursor=rows[-1][0]+step if rows else start
    while cursor<=end:
        page=get('/fapi/v1/klines',dict(symbol=symbol,interval=interval,startTime=cursor,endTime=end,limit=499))
        if not isinstance(page,list) or not page:raise ValueError('Missing candles: '+symbol)
        for row in page:
            if not isinstance(row,list) or len(row)<8 or row[0]!=cursor or row[0]>end:raise ValueError('Invalid candle page: '+symbol)
            rows.append(row);cursor+=step
    if [r[0] for r in rows]!=list(range(start,end+1,step)):raise ValueError('Incomplete candle history: '+symbol)
    return rows

def funding_rows(get,symbol,start,end,cached):
    rows=[r for r in cached if start<=r['fundingTime']<=end]
    cursor=rows[-1]['fundingTime']+1 if rows else start
    while cursor<=end:
        page=get('/fapi/v1/fundingRate',dict(symbol=symbol,startTime=cursor,endTime=end,limit=1000))
        if not isinstance(page,list):raise ValueError('Invalid funding response')
        if not page:break
        for row in page:
            t=row['fundingTime']
            if t<cursor or t>end:raise ValueError('Invalid funding ordering')
            rows.append(row);cursor=t+1
    return rows

def packet_bytes(packet):
    return json.dumps(packet,sort_keys=True,separators=(',',':'),allow_nan=False).encode()

def make_checkpoint(packet,end,now=None):
    now=int(time.time()*1000) if now is None else now
    if end>now or end%HOUR or end<=START or end>START+MAX_DAYS*DAY:raise ValueError('Invalid study boundary')
    content=packet_bytes(packet)
    sha=hashlib.sha256(content).hexdigest()
    with tempfile.TemporaryDirectory() as folder:
        path=pathlib.Path(folder)/'packet.json';path.write_bytes(content)
        args=load_packet(path,sha,end,start=START)
    stamp=lambda t:dt.datetime.fromtimestamp(t/1000,dt.timezone.utc).isoformat().replace('+00:00','Z')
    return dict(status='provisional-paper',start=stamp(START),as_of=stamp(end),orders=False,scheduled=False,
                initial_capital=INITIAL_CAPITAL,source='binance-usds-public',calculation='hourly-paper-replay',snapshot_sha256=sha,
                scenarios=[replay(*args,START,end,fee,slip,False,initial_capital=INITIAL_CAPITAL) for fee,slip in [(.0006,.0003),(.0008,.0007)]])

def collect(previous,end,get=public_get):
    if end<=START or end>START+MAX_DAYS*DAY or end%HOUR:raise ValueError('Invalid study boundary')
    clock=get('/fapi/v1/time',{})
    if clock['serverTime']<end:raise ValueError('Exchange clock behind report boundary')
    previous=previous or {}
    if previous and previous.get('source')!='binance-usds-public':raise ValueError('Unexpected cached source')
    packet=dict(source='binance-usds-public',daily={},hourly={},funding={},current_exchange_rules=get('/fapi/v1/exchangeInfo',{}))
    daily_start=START//DAY*DAY-29*DAY
    for s in SYMBOLS:
        packet['daily'][s]=candle_rows(get,s,'1d',daily_start,end//DAY*DAY-DAY,previous.get('daily',{}).get(s,[]))
        packet['hourly'][s]=candle_rows(get,s,'1h',START,end,previous.get('hourly',{}).get(s,[]))
        # Include <1s settlement timestamp jitter at the boundary; the engine
        # normalizes it and still uses only the already elapsed settlement.
        packet['funding'][s]=funding_rows(get,s,START,end+999,previous.get('funding',{}).get(s,[]))
    return packet

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--end',required=True,type=int);a=p.parse_args()
    previous=json.loads(a.input.read_text())
    packet=collect(previous,a.end)
    checkpoint=make_checkpoint(packet,a.end)
    a.output.write_text(json.dumps(dict(packet=packet,checkpoint=checkpoint),separators=(',',':'),allow_nan=False))
    print(json.dumps(dict(as_of=checkpoint['as_of'],snapshot_sha256=checkpoint['snapshot_sha256'])))
if __name__=='__main__':
    try:main()
    except Exception as e:
        print(str(e),file=sys.stderr);sys.exit(1)
