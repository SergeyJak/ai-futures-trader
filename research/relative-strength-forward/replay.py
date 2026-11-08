"""Offline forward checkpoint. Input is saved public Binance tool data; no orders."""
import argparse,datetime as dt,json,pathlib,hashlib,math
from engine import replay,SYMBOLS,HOUR,DAY
UTC=dt.timezone.utc
START=int(dt.datetime(2026,11,6,1,tzinfo=UTC).timestamp()*1000)

def timestamp(value):
    time=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    if time.tzinfo is None:raise ValueError('Explicit timezone required')
    return int(time.timestamp()*1000)

def load_packet(path,expected_sha,end,start=START):
    content=path.read_bytes()
    if hashlib.sha256(content).hexdigest()!=expected_sha:raise ValueError('Snapshot SHA256 mismatch')
    packet=json.loads(content)
    if packet['source']!='binance-usds-public':raise ValueError('Unexpected source')
    daily=packet['daily'];hourly={};funding={}
    if set(daily)!=set(SYMBOLS):raise ValueError('Unexpected symbol universe')
    for s in SYMBOLS:
        rows=daily[s]
        if len(rows)<29 or any(b[0]-a[0]!=DAY for a,b in zip(rows,rows[1:])):raise ValueError('Missing daily warmup')
        for row in rows:
            values=list(map(float,row[1:5]))+[float(row[7])]
            if not all(math.isfinite(v) for v in values) or min(values[:4])<=0 or values[4]<0:raise ValueError('Invalid daily values')
            if row[0]%DAY or row[6]!=row[0]+DAY-1:raise ValueError('Invalid daily boundary')
        if rows[0][0]>start//DAY*DAY-29*DAY:raise ValueError('Warmup begins too late')
        hourly[s]={}
        for row in packet['hourly'][s]:
            t=row[0]
            if t in hourly[s] or t%HOUR:raise ValueError('Duplicate or unaligned hourly candle')
            o,h,l,c=map(float,row[1:5])
            if not all(math.isfinite(v) for v in [o,h,l,c]) or not (0<l<=min(o,c)<=max(o,c)<=h):raise ValueError('Invalid OHLC')
            hourly[s][t]=row
        funding[s]={}
        for r in packet['funding'][s]:
            slot=round(r['fundingTime']/(8*HOUR))*8*HOUR
            if abs(slot-r['fundingTime'])>=1000 or slot in funding[s]:raise ValueError('Invalid funding slots')
            rate,mark=float(r['fundingRate']),float(r['markPrice'])
            if not math.isfinite(rate) or not math.isfinite(mark) or mark<=0:raise ValueError('Invalid funding values')
            funding[s][slot]=(rate,mark)
    frozen=json.loads(pathlib.Path(__file__).with_name('exchange-rules-2026-11-05.json').read_text())
    rules={r['symbol']:{f['filterType']:f for f in r['filters']} for r in frozen['symbols']}
    current={r['symbol']:{f['filterType']:f for f in r['filters']} for r in packet['current_exchange_rules']['symbols']}
    for s in SYMBOLS:
        for key in ['MARKET_LOT_SIZE','MIN_NOTIONAL']:
            if current[s][key]!=rules[s][key]:raise ValueError('Exchange rules changed: '+s+' '+key)
    return daily,hourly,funding,rules

def main():
    p=argparse.ArgumentParser();p.add_argument('--start',default='2026-11-06T01:00:00Z');p.add_argument('--capital',type=float,default=100.);p.add_argument('--snapshot',type=pathlib.Path);p.add_argument('--sha256');p.add_argument('--as-of',required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    end=timestamp(a.as_of);start=timestamp(a.start)
    if start%DAY!=HOUR or not math.isfinite(a.capital) or a.capital<=0:raise ValueError('Invalid start or capital')
    if end>int(dt.datetime.now(UTC).timestamp()*1000) or end%HOUR:raise ValueError('Only elapsed full-hour boundaries are allowed')
    if end<=start:
        result={'status':'waiting-for-forward-data','start':a.start,'initial_capital':a.capital,'as_of':a.as_of,'orders':False,'scheduled':False}
    else:
        if not a.snapshot or not a.sha256:raise ValueError('Provide snapshot and SHA256')
        args=load_packet(a.snapshot,a.sha256,end,start=start)
        result={'status':'provisional-paper','start':a.start,'initial_capital':a.capital,'as_of':a.as_of,'orders':False,'scheduled':False,'snapshot_sha256':a.sha256,'scenarios':[replay(*args,start,end,fee,slip,False,initial_capital=a.capital) for fee,slip in [(.0006,.0003),(.0008,.0007)]]}
    a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='scenarios'}))
if __name__=='__main__':main()
