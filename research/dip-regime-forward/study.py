"""Read-only, pre-registered SOL 12h paper cohort study; no order or account writes."""
import argparse
import datetime as dt
import json
import math
import random
import statistics
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://market-collector-production-b906.up.railway.app"
MINUTE = 60
DAY = 86400
FEE = 0.0006
SLIP = 0.0003
STRESS = 0.0003
NOTIONAL = 10.0
CAPITAL = 100.0
ORIGINAL_CUTOFF = "2026-10-30T00:00:00Z"
# New hypotheses are frozen before this future boundary. Earlier OOS is now descriptive.
FORWARD_CUTOFF = "2026-11-11T00:00:00Z"
STRATEGIES = ("dip_continuation", "dip_reversal", "momentum_continuation")
FILTERS = ("short_only", "trend_aligned", "moderate_volatility", "volume_rising", "combined")
PRIMARY = "short_only"
MAX_FUNDING_GAP = 8 * 3600

def ts(value):
    if isinstance(value, (int, float)):
        return int(value / 1000)
    return int(dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())

def iso(value):
    return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat().replace("+00:00", "Z")

def number(value):
    x = float(value)
    if not math.isfinite(x):
        raise ValueError("nonfinite number")
    return x

def get(path, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                return json.load(response)
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)

def load_trades(key):
    report = get("/api/strategy-paper/" + key)
    if report.get("realOrders") is not False or report.get("mode") != "forward-paper":
        raise ValueError("not a paper-only report")
    variant = next(v for v in report["variants"] if v["id"] == "12h")
    rows = [t for t in variant["trades"] if t.get("execution_model") == "next-open-v2"]
    total = int(variant["postFixClosedTrades"])
    truncated = len(rows) != total
    if truncated:
        # Latest 150 rows are safe for the prospective period only while an
        # earlier entry remains in the returned history. Never silently truncate it.
        if len(rows) != 150 or total < len(rows) or min(ts(t["entry_at"]) for t in rows) >= ts(FORWARD_CUTOFF):
            raise ValueError(key + ": prospective trade history may be truncated")
        ordered = sorted(rows, key=lambda t: int(t["id"]))
        if any(ts(a["entry_at"]) > ts(b["entry_at"]) for a,b in zip(ordered,ordered[1:])):
            raise ValueError(key + ": nonchronological trade IDs in truncated history")
    return rows, total, truncated

def load_candles(start, end):
    candles = {}
    while start <= end:
        stop = min(end, start + DAY - MINUTE)
        data = get("/api/trade-candles", dict(symbol="SOLUSDT", **{"from": iso(start), "to": iso(stop)}))
        for row in data["candles"]:
            at = ts(row["start_at"])
            if at in candles or not start <= at <= stop or at % MINUTE:
                raise ValueError("duplicate or out-of-range candle")
            o, h, l, c, v = (number(row[k]) for k in ("open", "high", "low", "close", "volume"))
            if min(o, h, l, c) <= 0 or not l <= min(o, c) <= max(o, c) <= h or v < 0:
                raise ValueError("invalid candle")
            candles[at] = (c, v)
        start = stop + MINUTE
    return candles

def load_funding(start, end, status):
    coverage = next((x["details"].get("fundingCoverage", {}).get("SOLUSDT")
                     for x in status["status"] if x["name"] == "public-research-funding"), None)
    if not coverage or coverage.get("complete") is not True:
        return None, "provider coverage incomplete"
    if ts(coverage["requestedFrom"]) > start or ts(coverage["requestedTo"]) < end:
        return None, "provider coverage does not span trades"
    lower = max(ts(coverage["requestedFrom"]), start - MAX_FUNDING_GAP)
    upper = min(ts(coverage["requestedTo"]), end + MAX_FUNDING_GAP)
    rates = {}
    cursor = lower
    while cursor <= upper:
        stop = min(upper, cursor + 30 * DAY - 1)
        data = get("/api/research-data/funding", dict(symbol="SOLUSDT", **{"from": iso(cursor), "to": iso(stop)}))
        if data.get("possiblyTruncated"):
            return None, "funding API truncated"
        for row in data["rows"]:
            at, rate = ts(row["funding_at"]), number(row["rate"])
            if at in rates or not cursor <= at <= stop or abs(rate) > 1:
                return None, "invalid or duplicate funding settlement"
            rates[at] = rate
        cursor = stop + 1
    times = sorted(rates)
    if not times or times[0] > start or end - times[-1] > MAX_FUNDING_GAP:
        return None, "funding endpoints not covered"
    if any(b - a > MAX_FUNDING_GAP for a, b in zip(times, times[1:])):
        return None, "funding settlement gap exceeds 8h"
    return rates, "public rates complete; mark-notional approximated by preceding 1m close"

def score(row, candles, rates):
    a, b = ts(row["entry_at"]), ts(row["exit_at"])
    entry, exit_price = number(row["entry_price"]), number(row["exit_price"])
    side = row["side"]
    if side not in ("LONG", "SHORT") or a % MINUTE or b % MINUTE or not 0 < b-a <= 12*3600 or min(entry, exit_price) <= 0:
        raise ValueError("invalid corrected trade")
    if row.get("execution_model") != "next-open-v2":
        raise ValueError("legacy trade")
    number(row["net_pnl"])
    prior = [candles[t] for t in range(a-60*MINUTE, a, MINUTE)]
    # Require the entire observed position window, not only the entry features.
    for t in range(a, b, MINUTE):
        if t not in candles:
            raise KeyError("missing in-position candle")
    closes = [p[0] for p in prior]
    move = closes[-1] / closes[0] - 1
    vol = math.sqrt(sum(math.log(y/x)**2 for x, y in zip(closes, closes[1:])))
    earlier = statistics.mean(p[1] for p in prior[:45])
    recent = statistics.mean(p[1] for p in prior[45:])
    direction = 1 if side == "LONG" else -1
    trend = direction * move >= 0.003
    moderate = vol <= 0.012
    rising = earlier > 0 and recent / earlier >= 1.2
    regime = "up" if move >= 0.003 else "down" if move <= -0.003 else "range"
    quantity = NOTIONAL / entry
    def pnl(price):
        return quantity * (direction * (price-entry) - FEE*(entry+price))
    before = pnl(exit_price)
    strict_funding = 0.0
    boundary_funding = 0.0
    events = []
    settlement_details = []
    if rates is not None:
        for t, rate in sorted(rates.items()):
            if a <= t <= b:
                mark_proxy = candles[t-MINUTE][0]
                amount = -direction * quantity * mark_proxy * rate
                boundary = t == a or t == b
                applied = min(0.0, amount) if boundary else amount
                settlement_details.append(dict(at=iso(t), rate=rate, mark_proxy=mark_proxy,
                                               modeled_amount=applied, boundary=boundary))
                if not boundary:
                    strict_funding += applied
                else:
                    # Unknown ordering at the exact open/close: use adverse bound.
                    boundary_funding += applied
                events.append((t, applied))
    after = before + strict_funding + boundary_funding if rates is not None else None
    stress = after - STRESS * quantity * (entry+exit_price) if after is not None else None
    # Minute-close mark-to-market, excluding the final exit bar (stop/take can
    # occur before its close). Include hypothetical exit slippage and both fees.
    mtm = []
    for t in range(a, b-MINUTE, MINUTE):
        mark = candles[t][0] * (1-direction*SLIP)
        accrued = sum(amount for at, amount in events if at <= t+MINUTE)
        mtm.append(pnl(mark) + accrued)
    return dict(id=str(row["id"]), a=a, b=b, side=side, regime=regime,
                entry_price=entry, exit_price=exit_price, short_only=side=="SHORT",
                volatility="moderate" if moderate else "high",
                trend_aligned=trend, moderate_volatility=moderate, volume_rising=rising,
                combined=trend and moderate and rising, before=before, after=after,
                funding=strict_funding+boundary_funding if rates is not None else None,
                boundary_funding=boundary_funding, stress=stress, mtm=mtm,
                funding_events=len(events), settlement_details=settlement_details)

def clean(rows, candles, rates):
    out = []
    quality = dict(loaded=len(rows), duplicates=0, overlaps=0, missing_history=0, invalid=0)
    seen_id, seen_entry = set(), set()
    last_exit = -1
    for row in sorted(rows, key=lambda r: (ts(r["entry_at"]), str(r["id"]))):
        a = ts(row["entry_at"])
        if str(row["id"]) in seen_id or a in seen_entry:
            quality["duplicates"] += 1
            continue
        seen_id.add(str(row["id"]))
        seen_entry.add(a)
        try:
            r = score(row, candles, rates)
        except KeyError:
            quality["missing_history"] += 1
            continue
        except (ValueError, TypeError):
            quality["invalid"] += 1
            continue
        if r["a"] < last_exit:
            # Causal first-entry selection, never choose using future exit times.
            quality["overlaps"] += 1
            continue
        last_exit = r["b"]
        out.append(r)
    quality["usable"] = len(out)
    return out, quality

def block_ci(rows, values, counts=None):
    """Deterministic 2-calendar-day moving-block bootstrap; ratio of sums."""
    if len(rows) < 2:
        return None
    first, last = rows[0]["a"]//DAY, rows[-1]["a"]//DAY
    days = last-first+1
    if days < 2:
        return None
    totals = [[0.0, 0] for _ in range(days)]
    for i, r in enumerate(rows):
        cell = totals[r["a"]//DAY-first]
        cell[0] += values[i]
        cell[1] += 1 if counts is None else counts[i]
    rng = random.Random(20261110)
    estimates = []
    for _ in range(2000):
        total = n = 0
        for k in range(0, days, 2):
            j = rng.randrange(days)
            for offset in range(min(2, days-k)):
                x, c = totals[(j+offset) % days]
                total += x
                n += c
        if n:
            estimates.append(total/n)
    if len(estimates) < 1000:
        return None
    estimates.sort()
    return [estimates[int(.025*(len(estimates)-1))], estimates[int(.975*(len(estimates)-1))]]

def metrics(rows):
    rows = sorted(rows, key=lambda r: r["a"])
    funded = all(r["after"] is not None for r in rows)
    values = [r["after"] if funded else r["before"] for r in rows]
    equity = peak = mtm_peak = CAPITAL
    dd = mtm_dd = 0.0
    for r, p in zip(rows, values):
        for mark in r["mtm"]:
            value = equity + mark
            mtm_peak = max(mtm_peak, value)
            mtm_dd = max(mtm_dd, 100*(mtm_peak-value)/mtm_peak)
        equity += p
        peak = max(peak, equity)
        dd = max(dd, 100*(peak-equity)/peak)
        mtm_peak = max(mtm_peak, equity)
        mtm_dd = max(mtm_dd, 100*(mtm_peak-equity)/mtm_peak)
    n = len(rows)
    return dict(trades=n, active_days=len({r["a"]//DAY for r in rows}),
                net_before_funding=sum(r["before"] for r in rows),
                funding=sum(r["funding"] for r in rows) if funded else None,
                net_after_funding=sum(values) if funded else None,
                return_on_100_pct=sum(values) if funded else None,
                stress_net=sum(r["stress"] for r in rows) if funded else None,
                max_drawdown_closed_pct=dd, max_drawdown_minute_close_pct=mtm_dd,
                drawdown_basis="after modeled funding" if funded else "before funding",
                mean_net=sum(values)/n if n else None,
                ci95_mean_per_trade=block_ci(rows, values),
                funding_events=sum(r["funding_events"] for r in rows),
                adverse_boundary_funding=sum(r["boundary_funding"] for r in rows))

def group(rows, eligible=True, primary=PRIMARY):
    baseline = metrics(rows)
    result = dict(baseline=baseline, sides={}, regimes={}, volatility={}, filters={})
    for side in ("LONG", "SHORT"):
        result["sides"][side] = metrics([r for r in rows if r["side"] == side])
        for regime in ("up", "down", "range"):
            result["regimes"][side+"_"+regime] = metrics([r for r in rows if r["side"] == side and r["regime"] == regime])
    for vol in ("moderate", "high"):
        result["volatility"][vol] = metrics([r for r in rows if r["volatility"] == vol])
    funded = all(r["after"] is not None for r in rows)
    for name in FILTERS:
        chosen = [r for r in rows if r[name]]
        m = metrics(chosen)
        # Paired comparison on identical baseline opportunities: skipped trades
        # contribute zero. Not a counterfactual replay of newly freed capacity.
        delta = [0.0 if r[name] else -(r["after"] if funded else r["before"]) for r in rows]
        ci = block_ci(rows, delta)
        decision = "descriptive_or_secondary" if name != primary else "insufficient_forward_data"
        if name == primary and eligible and funded and baseline["trades"] >= 30 and m["trades"] >= 30 and m["active_days"] >= 20:
            if m["net_after_funding"] <= 0 or sum(delta) <= 0 or m["stress_net"] <= 0:
                decision = "reject_no_net_edge"
            elif ci and ci[0] > 0 and m["ci95_mean_per_trade"] and m["ci95_mean_per_trade"][0] > 0:
                decision = "positive_paper_evidence_not_execution_proof"
            else:
                decision = "inconclusive_uncertainty"
        m.update(paired_delta=sum(delta), paired_ci95_per_opportunity=ci, decision=decision)
        result["filters"][name] = m
    return result

def split(rows, quality, primary=PRIMARY):
    old, new = ts(ORIGINAL_CUTOFF), ts(FORWARD_CUTOFF)
    development = [r for r in rows if r["b"] <= old]
    prior = [r for r in rows if r["a"] >= old and r["b"] <= new]
    forward = [r for r in rows if r["a"] >= new]
    quality["purged_cross_boundary"] = len(rows)-len(development)-len(prior)-len(forward)
    clean_quality = not any(quality[k] for k in ("duplicates", "overlaps", "missing_history", "invalid"))
    return dict(development=group(development, False, None), prior_holdout_descriptive=group(prior, False, None),
                prospective=group(forward, clean_quality, primary))

def main(output):
    raw = {key: load_trades(key) for key in STRATEGIES}
    all_rows = [r for rows, _, _ in raw.values() for r in rows]
    if not all_rows:
        raise ValueError("no corrected paper trades")
    start = min(ts(r["entry_at"]) for r in all_rows)
    end = max(ts(r["exit_at"]) for r in all_rows)
    if end-start > 45*DAY:
        raise ValueError("study exceeds bounded 45-day data window")
    status = get("/api/research-data")
    candles = load_candles(start-60*MINUTE, end-MINUTE)
    rates, funding_status = load_funding(start, end, status)
    report = dict(as_of=status["at"], source=BASE, mode="read-only-paper-cohort",
                  real_orders=False, original_cutoff=ORIGINAL_CUTOFF, prospective_cutoff=FORWARD_CUTOFF,
                  capital=CAPITAL, fixed_notional=NOTIONAL, fee_per_side=FEE, embedded_slippage_per_side=SLIP,
                  extra_stress_per_side=STRESS, funding_status=funding_status,
                  funding_verified_cashflow=False, primary_hypothesis="dip_continuation/12h/short_only", strategies={})
    for key, (rows, total, truncated) in raw.items():
        scored, quality = clean(rows, candles, rates)
        quality.update(post_fix_total=total, historical_truncated=truncated, prospective_complete=True)
        phases = split(scored, quality, PRIMARY if key == "dip_continuation" else None)
        report["strategies"][key] = dict(quality=quality, **phases,
            trade_evidence=[{k:v for k,v in row.items() if k!="mtm"} for row in scored])
        print("QUALITY", key, json.dumps(quality, separators=(",", ":")))
        for phase, result in phases.items():
            # Full report is retained as artifact; concise logs remain inspectable.
            summary = dict(baseline=result["baseline"], sides=result["sides"],
                           regimes=result["regimes"] if key == "dip_continuation" else {},
                           filters=result["filters"] if key == "dip_continuation" else {})
            print("RESULT", key, phase, json.dumps(summary, separators=(",", ":")))
    print("FUNDING", funding_status)
    Path(output).write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="dip-regime-report.json")
    main(parser.parse_args().output)
