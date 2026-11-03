"""Read-only checkpoint of fixed rules and archived public data, 2026-11-03.

Usage: python checkpoint.py --snapshot DIR --audit-dir REPO/research/collector-audit
DIR includes raw snapshot/manifest and the unchanged frozen runner under forward/.
"""
import argparse, collections, datetime as dt, hashlib, json, pathlib, statistics, sys
from decimal import Decimal

parser=argparse.ArgumentParser()
parser.add_argument('--snapshot',type=pathlib.Path,required=True)
parser.add_argument('--audit-dir',type=pathlib.Path,required=True)
args=parser.parse_args()
sys.path.insert(0,str(args.audit_dir))
from audit import load_snapshot,timestamp,stats,percentile

root=args.snapshot
manifest,tables=load_snapshot(root)
coverage=json.loads((root/'coverage.json').read_text())
start=timestamp('2026-11-02T17:00:00Z')
end=timestamp(manifest['end'])
iso=lambda t:dt.datetime.fromtimestamp(t,dt.timezone.utc).isoformat().replace('+00:00','Z')
report={'snapshot_at':manifest['captured_at'],'market_window':{'from':iso(start),'to_exclusive':iso(end)},
        'collector_current_process':coverage['runtime'],'symbols':{},'forward':[],
        'fee_assumptions':coverage['feeAssumptions']}
bins=collections.Counter()
for symbol in tables['samples']:
    samples=sorted((r for r in tables['samples'][symbol].values() if start<=timestamp(r['bucket_at'])<end),key=lambda r:r['bucket_at'])
    trades=sorted((r for r in tables['trades'][symbol].values() if start<=timestamp(r['bucket_at'])<end),key=lambda r:r['bucket_at'])
    gaps=[];moves=[];connections=[]
    for a,b in zip(samples,samples[1:]):
        delta=timestamp(b['bucket_at'])-timestamp(a['bucket_at'])
        if delta>10:gaps.append({'after':a['bucket_at'],'before':b['bucket_at'],'seconds':delta,'missing_slots':int(delta/10)-1})
        if delta==10 and a['connection_id']==b['connection_id']:
            movement=abs((b['bid']+b['ask'])/(a['bid']+a['ask'])-1)*10000
            moves.append((movement,b))
    for r in samples:
        if not connections or connections[-1]['id']!=r['connection_id']:
            connections.append({'id':r['connection_id'],'first_sample':r['bucket_at']})
    fast_threshold=percentile([m for m,_ in moves],.95)
    fast=[r for m,r in moves if m>=fast_threshold]
    top=lambda r:min(r['bid']*r['bid_quantity'],r['ask']*r['ask_quantity'])
    for r in trades:bins[timestamp(r['bucket_at'])]+=r['buys']+r['sells']
    funding=sorted((r for r in tables['funding'][symbol].values() if timestamp(r['funding_at'])>=start),key=lambda r:r['funding_at'])
    report['symbols'][symbol]={
        'sample_count':len(samples),'quote_gaps':gaps,'connections':connections,
        'trade_bucket_count':len(trades),'observed_trade_count':sum(r['buys']+r['sells'] for r in trades),
        'incomplete_trade_buckets':[r['bucket_at'] for r in trades if not r['stream_continuous']],
        'mean_spread_bps':statistics.fmean(r['spread_bps'] for r in samples),
        'spread_bps':stats([r['spread_bps'] for r in samples]),
        'top_both_sides_cover_100_fraction':sum(top(r)>=100 for r in samples)/len(samples),
        'top_both_sides_cover_300_fraction':sum(top(r)>=300 for r in samples)/len(samples),
        'minimum_side_top_notional':stats([top(r) for r in samples]),
        'fast_move_definition':'Top 5% absolute adjacent 10s midpoint changes; same connection; descriptive, not an entry rule',
        'fast_move_threshold_bps':fast_threshold,'fast_move_samples':len(fast),
        'fast_move_spread_bps':stats([r['spread_bps'] for r in fast]),
        'fast_move_top_both_sides_cover_100_fraction':sum(top(r)>=100 for r in fast)/len(fast),
        'funding_settlements':funding,
        'assumed_fee_plus_mean_spread_roundtrip_bps':2*coverage['feeAssumptions']['takerRate']*10000+statistics.fmean(r['spread_bps'] for r in samples)}
report['peak_accepted_120_seconds']=max(sum(bins[t-10*i] for i in range(12)) for t in list(bins))
report['peak_accepted_40_seconds']=max(sum(bins[t-10*i] for i in range(4)) for t in list(bins))

results=json.loads((root/'forward/forward-results.json').read_text())
closed=json.loads((root/'forward/forward-trades.json').read_text())
prices={}
for symbol in tables['samples']:
    prices[symbol]={}
    for file in (root/'forward/forward-cache/data').glob(symbol+'-*.json'):
        for c in json.loads(file.read_text())['candles']:
            prices[symbol][timestamp(c['start_at'])]=Decimal(c['close'])
for result in results:
    since=timestamp(result['start']);until=timestamp(result['as_of'])
    trades=[r for r in closed if r['scenario']==result['scenario']]
    positions=[dict(r,open=False) for r in trades]
    positions += [dict(p,symbol=s,exit_at=iso(until),open=True) for s,p in result['open_positions'].items()]
    occupied=set();events=[];funding=Decimal(0);funding_complete=True
    for p in positions:
        entry=timestamp(p['entry_at']);exit=timestamp(p['exit_at'])
        occupied.update(range(int(max(since,entry)),int(min(until,exit)),60))
        rates={timestamp(r['funding_at']):Decimal(r['rate']) for r in tables['funding'][p['symbol']].values()}
        quantity=Decimal(str(p['quantity']));direction=Decimal(1 if p['side']=='LONG' else -1)
        for at in range(int(entry//28800)*28800,int(min(until,exit))+1,28800):
            if at<entry or at>=until or at>exit:continue
            ambiguous=at==entry or (not p['open'] and at==exit)
            if ambiguous or at not in rates:
                funding_complete=False;events.append({'at':iso(at),'symbol':p['symbol'],'estimated_cashflow':None,'reason':'boundary ordering or missing rate'});continue
            candidates=[r for r in tables['samples'][p['symbol']].values()
                        if r['mark_price'] is not None and at-30<=timestamp(r['observed_at'])<=at]
            if not candidates:
                funding_complete=False;events.append({'at':iso(at),'symbol':p['symbol'],'estimated_cashflow':None,'reason':'missing recent pre-settlement mark sample'});continue
            sample=max(candidates,key=lambda r:r['observed_at'])
            mark=Decimal(str(sample['mark_price']));amount=-direction*quantity*mark*rates[at]
            funding+=amount
            events.append({'at':iso(at),'symbol':p['symbol'],'rate':str(rates[at]),'mark_proxy':str(mark),
                           'sample_observed_at':sample['observed_at'],'estimated_cashflow':float(amount)})
    # Independent decimal reconciliation against the known endpoint close, not the runner's P&L helper.
    fee,slip={'baseline':('0.0006','0.0003'),'elevated':('0.0008','0.0007'),'severe':('0.001','0.0015')}[result['scenario']]
    fee=Decimal(fee);slip=Decimal(slip)
    calculated_cash=Decimal('100')+sum((Decimal(str(t['net'])) for t in trades),Decimal(0))-Decimal(str(result['open_entry_fees']))
    calculated_equity=calculated_cash;open_detail=[]
    for s,p in result['open_positions'].items():
        d=Decimal(1 if p['side']=='LONG' else -1);q=Decimal(str(p['quantity']));entry=Decimal(str(p['entry']))
        mark=prices[s][until-60];exit_fill=mark*(1-d*slip);unrealized=q*d*(exit_fill-entry)-fee*q*exit_fill
        calculated_equity+=unrealized
        open_detail.append(dict(symbol=s,**p,endpoint_trade_close=float(mark),modeled_exit_fill=float(exit_fill),unrealized_after_exit_costs=float(unrealized)))
    assert abs(float(calculated_cash)-result['cash'])<1e-9
    assert abs(float(calculated_equity)-result['equity'])<1e-9
    report['forward'].append({'scenario':result['scenario'],'from':result['start'],'to_exclusive':result['as_of'],
        'entries':len(positions),'closed_trades':len(trades),'open_positions':open_detail,
        'cash':result['cash'],'equity_before_funding':result['equity'],'closed_realized_net':result['closed_realized_net'],
        'max_drawdown_pct_before_funding':result['max_drawdown_pct'],
        'minutes_flat':int((until-since)/60)-len(occupied),'minutes_total':int((until-since)/60),
        'flat_fraction':1-len(occupied)/((until-since)/60),
        'funding_events':events,'funding_estimate':float(funding) if funding_complete else None,
        'equity_plus_estimated_funding':result['equity']+float(funding) if funding_complete else None,
        'funding_note':'Separate fixed-position sensitivity using sampled pre-settlement marks; no resizing, no exact exchange cashflow, no revised drawdown. Settlement at exclusive cutoff excluded.',
        'decision':'insufficient_forward_sample; rules unchanged'})
hashes={str(p.relative_to(root/'forward')):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted((root/'forward/forward-cache/data').glob('*.json'))}
(root/'forward-input-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
(root/'checkpoint-summary.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'market_symbols':{s:{k:v for k,v in r.items() if k in ['sample_count','observed_trade_count','mean_spread_bps','fast_move_threshold_bps','fast_move_spread_bps','top_both_sides_cover_100_fraction']} for s,r in report['symbols'].items()},'peak_120s':report['peak_accepted_120_seconds'],'peak_40s':report['peak_accepted_40_seconds'],'forward':report['forward']},indent=2))
