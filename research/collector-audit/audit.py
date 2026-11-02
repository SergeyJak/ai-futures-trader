"""Read-only diagnostic. Fixed historical trades; no refitting or order execution.

python audit.py --snapshot /path/to/snapshot --study /path/to/strategy-study
The snapshot is produced by download.py. All amounts are USDT unless labeled.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import math
import pathlib
import statistics

SYMBOLS = ('BTCUSDT', 'ETHUSDT', 'SOLUSDT')
SETTLEMENT = 8 * 3600  # Verified against the downloaded histories, not universal.


def timestamp(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def funding_cashflow(trade, rates, prices):
    """Estimate on previous-minute trade-price closes, NOT historical mark prices.

    Require bracketing history and every expected 8h settlement. Entry/exit-time
    settlements have unknown ordering, so report their sensitivity separately.
    Missing evidence withholds the estimate rather than substituting a zero.
    """
    entry, exit = trade['entry_at'], trade['exit_at']
    result = dict(estimate=None, boundary_min=None, boundary_max=None,
                  boundary_events=0, interior_events=0, missing=[])
    if not rates or min(rates) > entry or max(rates) < exit:
        result['missing'].append('history does not bracket trade')
        return result
    if any(t % SETTLEMENT for t in rates):
        result['missing'].append('unexpected settlement schedule')
        return result
    total = lower = upper = 0.0
    sign = -1 if trade['side'] == 'LONG' else 1
    assert trade['side'] in ('LONG', 'SHORT') and trade['quantity'] > 0 and exit >= entry
    for at in range(math.ceil(entry / SETTLEMENT) * SETTLEMENT, int(exit) + 1, SETTLEMENT):
        if at not in rates:
            result['missing'].append(f'missing rate at {at}')
            continue
        rate = rates[at]
        if rate == 0:
            cashflow = 0.0
        elif at - 60 not in prices:
            result['missing'].append(f'missing price proxy at {at}')
            continue
        else:
            cashflow = sign * trade['quantity'] * prices[at - 60] * rate
        if at in (entry, exit):
            result['boundary_events'] += 1
            lower += min(0, cashflow)
            upper += max(0, cashflow)
        else:
            result['interior_events'] += 1
            total += cashflow
    if not result['missing']:
        result.update(estimate=total, boundary_min=lower, boundary_max=upper)
    return result


def percentile(values, fraction):
    values = sorted(values)
    i = (len(values) - 1) * fraction
    lo, hi = math.floor(i), math.ceil(i)
    return values[lo] + (values[hi] - values[lo]) * (i - lo)


def stats(values):
    return dict(min=min(values), median=statistics.median(values),
                mean=statistics.fmean(values), p95=percentile(values, .95),
                p99=percentile(values, .99), max=max(values))


def load_snapshot(root):
    manifest = json.loads((root / 'manifest.json').read_text())
    assert hashlib.sha256((root / 'coverage.json').read_bytes()).hexdigest() == manifest['coverage_sha256']
    tables = {kind: {s: {} for s in SYMBOLS} for kind in ('samples', 'trades', 'funding')}
    for item in manifest['files']:
        content = (root / item['file']).read_bytes()
        assert hashlib.sha256(content).hexdigest() == item['sha256'], item['file']
        page = json.loads(content)
        assert not page['possiblyTruncated'] and len(page['rows']) == item['rows']
        kind, symbol = page['resource'], page['symbol']
        key = 'funding_at' if kind == 'funding' else 'bucket_at'
        for row in page['rows']:
            # Adjacent inclusive API windows share an identical endpoint row.
            prior = tables[kind][symbol].get(row[key])
            assert prior is None or prior == row, (kind, symbol, row[key])
            tables[kind][symbol][row[key]] = row
    return manifest, tables


def analyze(snapshot, study):
    manifest, tables = load_snapshot(snapshot)
    coverage = json.loads((snapshot / 'coverage.json').read_text())
    summary = dict(captured_at=manifest['captured_at'], end=manifest['end'],
                   drop_counter_at_snapshot=coverage['runtime']['microstructure']['droppedTrades'],
                   fee_assumptions=coverage['feeAssumptions'], symbols={}, fixed_trade_diagnostics=[])
    bins = collections.Counter()
    for symbol in SYMBOLS:
        samples = list(tables['samples'][symbol].values())
        trades = list(tables['trades'][symbol].values())
        funding = list(tables['funding'][symbol].values())
        at = sorted(timestamp(r['bucket_at']) for r in samples)
        spreads = [10000 * (r['ask'] - r['bid']) / ((r['ask'] + r['bid']) / 2) for r in samples]
        for r in trades:
            bins[timestamp(r['bucket_at'])] += r['buys'] + r['sells']
        top = [min(r['bid'] * r['bid_quantity'], r['ask'] * r['ask_quantity']) for r in samples]
        depth = [min(r['bid_depth_notional'], r['ask_depth_notional']) for r in samples]
        funding_times = sorted(timestamp(r['funding_at']) for r in funding)
        expected = int((at[-1] - at[0]) / 10) + 1
        summary['symbols'][symbol] = dict(
            sample_rows=len(samples), first=min(r['bucket_at'] for r in samples),
            last=max(r['bucket_at'] for r in samples), sample_missing_slots=expected-len(samples),
            max_sample_gap_seconds=max(b-a for a,b in zip(at, at[1:])),
            spread_bps=stats(spreads), minimum_side_top_notional=stats(top),
            minimum_side_50_level_notional=stats(depth),
            top_both_sides_cover_100_fraction=sum(n >= 100 for n in top)/len(top),
            top_both_sides_cover_300_fraction=sum(n >= 300 for n in top)/len(top),
            trade_buckets=len(trades), incomplete_trade_buckets=sum(not r['stream_continuous'] for r in trades),
            observed_trade_count=sum(r['buys'] + r['sells'] for r in trades),
            funding_rows=len(funding), funding_rate_bps=stats([float(r['rate'])*10000 for r in funding]),
            funding_schedule_verified=all(t % SETTLEMENT == 0 for t in funding_times) and
                all(b-a == SETTLEMENT for a,b in zip(funding_times, funding_times[1:])),
            fee_plus_mean_spread_round_trip_bps=2*coverage['feeAssumptions']['takerRate']*10000+statistics.fmean(spreads))
    summary['peak_accepted_trades_120_seconds'] = max(sum(bins[t-10*i] for i in range(12)) for t in bins.copy())
    summary['peak_accepted_trades_40_seconds'] = max(sum(bins[t-10*i] for i in range(4)) for t in bins.copy())
    prices = {}
    source_hashes = {}
    for symbol in SYMBOLS:
        prices[symbol] = {}
        for file in sorted((study / 'data').glob(symbol+'-*.json')):
            content = file.read_bytes()
            source_hashes[str(file.relative_to(study))] = hashlib.sha256(content).hexdigest()
            for candle in json.loads(content)['candles']:
                prices[symbol][timestamp(candle['start_at'])] = float(candle['close'])
    details = []
    for label, filename, strategy in [('selected_portfolio', 'portfolio-trades.csv', 'portfolio_trend_4h'),
                                      ('october_standalone', 'october-trades.csv', 'portfolio_trend_4h'),
                                      ('short_breakout', 'short-hold-trades.csv', 'short_breakout')]:
        file = study / filename
        source_hashes[filename] = hashlib.sha256(file.read_bytes()).hexdigest()
        rows = [r for r in csv.DictReader(file.open()) if r['strategy'] == strategy and r['scenario'] == 'baseline'
                and ('policy' not in r or r['policy'] == 'risk1_gross3')]
        sums = collections.Counter()
        missing = 0
        for r in rows:
            symbol = r['symbol']
            rates = {timestamp(f['funding_at']):float(f['rate']) for f in tables['funding'][symbol].values()}
            result = funding_cashflow(dict(side=r['side'],quantity=float(r['quantity']),
                entry_at=timestamp(r['entry_at']),exit_at=timestamp(r['exit_at'])), rates, prices[symbol])
            details.append(dict(group=label,**r,**{'funding_'+k:v for k,v in result.items()}))
            missing += result['estimate'] is None
            for key in ['price_gross', 'slippage', 'fees', 'net']: sums[key] += float(r[key])
            if result['estimate'] is not None:
                for key in ['estimate', 'boundary_min', 'boundary_max', 'boundary_events', 'interior_events']:
                    sums['funding_'+key] += result[key]
        assert rows and abs(sums['price_gross']-sums['slippage']-sums['fees']-sums['net']) < 1e-8
        if missing:
            for key in ['estimate','boundary_min','boundary_max']: sums['funding_'+key] = None
        summary['fixed_trade_diagnostics'].append(dict(group=label,trades=len(rows),missing_estimates=missing,**sums,
            net_plus_estimated_funding=None if missing else sums['net']+sums['funding_estimate'],
            net_with_boundary_min=None if missing else sums['net']+sums['funding_estimate']+sums['funding_boundary_min'],
            net_with_boundary_max=None if missing else sums['net']+sums['funding_estimate']+sums['funding_boundary_max']))
    summary['limitations'] = [
        'Approx. one day of sampled quotes cannot establish a stable strategy or monthly return.',
        'Fees are configured assumptions, not account-verified rates. Sampled spread is not execution slippage.',
        'No historical quote costs are replaced by today\'s spreads.',
        'Funding is a fixed-trade sensitivity estimate on previous-minute closes, not settlement mark prices or verified cash flows.',
        'Entry/exit exactly at settlement have unknown ordering; boundary sensitivity is shown separately.',
        'Positions are not resized or re-simulated after funding; no revised drawdown or monthly performance is claimed.',
        'Absent trade buckets are unknown (possibly idle or lost); continuous buckets do not prove complete exchange delivery.',
    ]
    (snapshot / 'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    (snapshot / 'funding-trade-diagnostics.json').write_text(json.dumps(details,indent=2)+'\n')
    (snapshot / 'historical-input-hashes.json').write_text(json.dumps(source_hashes,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=pathlib.Path, required=True)
    parser.add_argument('--study', type=pathlib.Path, required=True)
    args = parser.parse_args()
    analyze(args.snapshot, args.study)
