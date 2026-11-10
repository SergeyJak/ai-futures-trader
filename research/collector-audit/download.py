"""Snapshot read-only research endpoints in capped windows; never treat absent rows as zeros."""
import argparse, concurrent.futures, datetime as dt, hashlib, json, pathlib, sys, urllib.parse

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from collector_http import read_bytes

ROOT=pathlib.Path(__file__).resolve().parent
BASE='https://market-collector-production-b906.up.railway.app'
def date(s): return dt.datetime.fromisoformat(s.replace('Z','+00:00'))
def iso(t): return t.isoformat().replace('+00:00','Z')
def get(path):
    return read_bytes(BASE+path)
def download(job):
    resource,symbol,start,end=job
    query=urllib.parse.urlencode(dict(symbol=symbol,**{'from':iso(start),'to':iso(end)}))
    path='/api/research-data/'+resource+'?'+query
    name=f'{resource}-{symbol}-{start:%Y%m%dT%H%M%S}.json'
    target=ROOT/'raw'/name
    content=target.read_bytes() if target.exists() else get(path)
    data=json.loads(content)
    assert not data.get('possiblyTruncated'),name
    assert data['symbol']==symbol and data['resource']==resource
    target.write_bytes(content)
    return dict(file='raw/'+name,url=BASE+path,sha256=hashlib.sha256(content).hexdigest(),rows=len(data['rows']))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=pathlib.Path,required=True)
    args=parser.parse_args()
    ROOT=args.output
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'raw').mkdir(exist_ok=True)
    if not (ROOT/'coverage.json').exists():
        (ROOT/'coverage.json').write_bytes(get('/api/research-data'))
    coverage=json.loads((ROOT/'coverage.json').read_text())
    # Freeze the upper bound from the initial snapshot, leaving a full grace period.
    end=date(coverage['at']).replace(microsecond=0)-dt.timedelta(seconds=60)
    jobs=[]
    for resource in ['samples','trades','funding']:
        for item in coverage[resource]:
            start=date(item['first_at'])
            step=dt.timedelta(days=30) if resource=='funding' else dt.timedelta(hours=3)
            while start<end:
                stop=min(start+step,end)
                jobs.append((resource,item['symbol'],start,stop))
                start=stop
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        files=list(pool.map(download,jobs))
    manifest=dict(source=BASE,captured_at=coverage['at'],end=iso(end),files=files,
                  coverage_sha256=hashlib.sha256((ROOT/'coverage.json').read_bytes()).hexdigest())
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'files':len(files),'rows':sum(f['rows'] for f in files),'end':iso(end)}))
