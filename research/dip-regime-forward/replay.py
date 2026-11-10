"""Frozen, read-only counterfactual SOL 12h replay. No order/account writes."""
import argparse
import json
import math
import random
import statistics
from pathlib import Path

from study import (MINUTE, DAY, CAPITAL, NOTIONAL, FEE, SLIP, STRESS,
                   ORIGINAL_CUTOFF, FORWARD_CUTOFF, ts, iso, number, get,
                   load_funding, load_trades, score, metrics)

START = ts(ORIGINAL_CUTOFF)
FORWARD = ts(FORWARD_CUTOFF)
CHECKPOINT = FORWARD + 30 * DAY
HOLD = 12 * 3600
STOP, TAKE = .01, .02
MODES = ("baseline", "short_only", "long_only")
SECONDARY_MODE = "short_up"
FILTER_MODES = ("volume_rising", "moderate_volatility")
ALL_MODES = MODES + (SECONDARY_MODE,) + FILTER_MODES
TREND_UP_MIN = .003
VOLUME_RATIO_MIN = 1.2
REALIZED_VOL_MAX = .012

def load_bars(start, end):
    """Exclusive end; every minute must be present and valid."""
    bars = {}
    cursor = start
    while cursor < end:
        stop = min(end, cursor + DAY)
        data = get("/api/trade-candles", dict(symbol="SOLUSDT",
                   **{"from": iso(cursor), "to": iso(stop-MINUTE)}))
        if data.get("symbol") != "SOLUSDT":
            raise ValueError("unexpected candle symbol")
        for row in data["candles"]:
            t = ts(row["start_at"])
            o,h,l,c,v = (number(row[k]) for k in ("open","high","low","close","volume"))
            if (t in bars or not cursor <= t < stop or t % MINUTE
                    or min(o,h,l,c) <= 0 or not l <= min(o,c) <= max(o,c) <= h
                    or v < 0 or row.get("confirmed") is False):
                raise ValueError("invalid, duplicate or unconfirmed candle at " + iso(t))
            bars[t] = (o,h,l,c,v)
        cursor = stop
    require_bars(bars, start, end)
    return bars

def require_bars(bars, start, end):
    for t in range(start, end, MINUTE):
        if t not in bars:
            raise ValueError("missing confirmed candle at " + iso(t))

def signal(bars, t):
    # Frozen src/strategy-paper.ts dip_continuation: 16 closes (15m move).
    # Its actual rule fades a move, despite the historical strategy name.
    c, prev, first = bars[t][3], bars[t-MINUTE][3], bars[t-15*MINUTE][3]
    move, minute = c/first-1, c/prev-1
    if move <= -.005 and minute < 0:
        return "LONG"
    if move >= .005 and minute > 0:
        return "SHORT"
    return None

def accepts(mode, side, bars, t):
    """Only confirmed closes through signal minute t; entry is t+MINUTE."""
    if mode == "baseline":
        return True
    if mode == SECONDARY_MODE:
        # Same 60 confirmed closes and up-regime threshold as study.score.
        return side == "SHORT" and bars[t][3]/bars[t-59*MINUTE][3]-1 >= TREND_UP_MIN
    if mode in FILTER_MODES:
        # Same frozen 60 confirmed bars as study.score; never the fill candle.
        prior = [bars[k] for k in range(t-59*MINUTE, t+MINUTE, MINUTE)]
        if mode == "volume_rising":
            earlier = statistics.mean(b[4] for b in prior[:45])
            recent = statistics.mean(b[4] for b in prior[45:])
            return earlier > 0 and recent / earlier >= VOLUME_RATIO_MIN
        closes = [b[3] for b in prior]
        realized = math.sqrt(sum(math.log(y/x)**2 for x,y in zip(closes,closes[1:])))
        return realized <= REALIZED_VOL_MAX
    return side.lower()+"_only" == mode

def open_position(side, t, bar):
    direction = 1 if side == "LONG" else -1
    return dict(side=side, a=t, entry=bar[0]*(1+direction*SLIP),
                entry_reference=bar[0])

def exit_decision(p, t, bar):
    o,h,l,c,_ = bar
    direction = 1 if p["side"] == "LONG" else -1
    stop, take = p["entry"]*(1-direction*STOP), p["entry"]*(1+direction*TAKE)
    stop_hit = l <= stop if direction == 1 else h >= stop
    take_hit = h >= take if direction == 1 else l <= take
    if stop_hit:
        return (min(stop,o) if direction == 1 else max(stop,o),
                "BOTH_STOP_FIRST" if take_hit else "STOP")
    if take_hit:
        return take, "TAKE"
    if t+MINUTE-p["a"] >= HOLD:
        return c, "TIME"
    return None

def close_position(p, b, reference, reason):
    direction = 1 if p["side"] == "LONG" else -1
    fill = reference*(1-direction*SLIP)
    qty = NOTIONAL/p["entry"]
    fee = FEE*qty*(p["entry"]+fill)
    slip = qty*direction*(p["entry"]-p["entry_reference"]+reference-fill)
    net = qty*direction*(fill-p["entry"])-fee
    return dict(id=str(p["a"]), side=p["side"], entry_at=iso(p["a"]), exit_at=iso(b),
                entry_price=p["entry"], exit_price=fill, entry_reference=p["entry_reference"],
                exit_reference=reference, reason=reason, net_pnl=net, fee=fee,
                slippage=slip, execution_model="next-open-v2")

def simulate(bars, start, entry_end, end, mode):
    """Independent flat accounts. No re-entry signal on an occupied/exit bar."""
    if mode not in ALL_MODES or not start <= entry_end <= end:
        raise ValueError("invalid replay boundaries")
    if any(t % MINUTE for t in (start,entry_end,end)):
        raise ValueError("unaligned replay boundaries")
    require_bars(bars, start-60*MINUTE, end)
    closed, position, pending = [], None, None
    for t in range(start-MINUTE, end, MINUTE):
        occupied = position is not None or pending is not None
        if pending is not None:
            if t >= entry_end:
                raise ValueError("entry outside frozen window")
            position = open_position(pending,t,bars[t])
            pending = None
        if position is not None:
            decision = exit_decision(position,t,bars[t])
            if decision:
                closed.append(close_position(position,t+MINUTE,*decision))
                position = None
        elif not occupied and start <= t+MINUTE < entry_end:
            side = signal(bars,t)
            if side and accepts(mode,side,bars,t):
                pending = side
    # Do not force-liquidate a trade at the report boundary. Mark it separately.
    mark = (close_position(position,end,bars[end-MINUTE][3],"OPEN_MARK")
            if position is not None else None)
    return closed, mark

def scored(raw, candles, rates):
    out = score(raw,candles,rates)
    out.update(reason=raw["reason"], fee=raw["fee"], slippage=raw["slippage"],
               entry_reference=raw["entry_reference"], exit_reference=raw["exit_reference"])
    return out

def evidence(row):
    return {k:v for k,v in row.items() if k != "mtm"}

def daily_ci(values, block, alpha=.05):
    """Circular calendar-day block bootstrap, including zero-trade days."""
    n = len(values)
    if n < max(2,block):
        return None
    rng = random.Random(20261110+block)
    draws = []
    for _ in range(2000):
        total = 0.0
        for k in range(0,n,block):
            j = rng.randrange(n)
            total += sum(values[(j+i)%n] for i in range(min(block,n-k)))
        draws.append(total/n)
    draws.sort()
    return [draws[int((alpha/2)*(len(draws)-1))],draws[int((1-alpha/2)*(len(draws)-1))]]

def compare(candidate, baseline, start, entry_end, funded):
    days = list(range(start//DAY,(entry_end+DAY-1)//DAY))
    daily = {d:0.0 for d in days}
    key = "after" if funded else "before"
    for rows, direction in ((candidate,1),(baseline,-1)):
        for r in rows:
            daily[r["a"]//DAY] += direction*r[key]
    values = list(daily.values())
    return dict(delta=sum(values), basis="after modeled funding" if funded else "before funding",
                calendar_days=len(values), mean_delta_per_day=sum(values)/len(values) if values else None,
                ci95_daily_delta_2d=daily_ci(values,2), ci95_daily_delta_7d=daily_ci(values,7),
                daily_delta=[dict(day=iso(d*DAY),delta=v) for d,v in daily.items()])

def secondary_report(rows, result, start, entry_end, funded, final):
    """Pre-registered secondary; compare independent accounts on identical days."""
    candidate = rows[SECONDARY_MODE]
    comparisons = {}
    for name, control in (("cash", []), ("short_only", rows["short_only"]),
                          ("baseline", rows["baseline"])):
        pair = compare(candidate,control,start,entry_end,funded)
        values = [r["delta"] for r in pair["daily_delta"]]
        # Conservative two-hypothesis family adjustment (primary + secondary).
        # All three comparisons must pass; 7-day blocks are a sensitivity gate.
        pair["ci97_5_daily_delta_2d"] = daily_ci(values,2,.025)
        pair["ci97_5_daily_delta_7d"] = daily_ci(values,7,.025)
        comparisons[name] = pair
    m = result[SECONDARY_MODE]
    decision = "descriptive_or_collecting"
    if final:
        if not funded or any(result[k]["open_position"] for k in
                             ("baseline","short_only",SECONDARY_MODE)):
            decision = "blocked_incomplete_cost_or_exit_evidence"
        elif m["trades"] < 30 or m["active_days"] < 20:
            decision = "insufficient_fixed_window_data"
        elif m["net_after_funding"] <= 0 or m["stress_net"] <= 0 or any(
                p["delta"] <= 0 for p in comparisons.values()):
            decision = "reject_no_net_edge"
        elif all(p[k] and p[k][0] > 0 for p in comparisons.values()
                 for k in ("ci97_5_daily_delta_2d","ci97_5_daily_delta_7d")):
            decision = "positive_secondary_replay_evidence_not_execution_proof"
        else:
            decision = "inconclusive_uncertainty"
    return dict(mode=SECONDARY_MODE, rule="SHORT and 60-close return >= 0.003",
                comparisons=comparisons, decision=decision)

def phase(bars, rates, start, entry_end, end, final=False):
    if entry_end <= start:
        return dict(status="waiting_for_new_data",start=iso(start),entry_end=iso(entry_end),modes={})
    candles = {t:(b[3],b[4]) for t,b in bars.items()}
    rows, result = {}, {}
    for mode in ALL_MODES:
        raw, mark = simulate(bars,start,entry_end,end,mode)
        rows[mode] = [scored(r,candles,rates) for r in raw]
        open_row = scored(mark,candles,rates) if mark else None
        m = metrics(rows[mode])
        if rates is None:
            m.update(net_after_funding=None,return_on_100_pct=None,stress_net=None,funding=None)
        with_open = metrics(rows[mode]+([open_row] if open_row else []))
        m.update(fees=sum(r["fee"] for r in rows[mode]),
                 slippage=sum(r["slippage"] for r in rows[mode]),
                 open_position=evidence(open_row) if open_row else None,
                 marked_net_after_funding=with_open["net_after_funding"] if rates is not None else None,
                 marked_net_before_funding=with_open["net_before_funding"],
                 marked_max_drawdown_pct=with_open["max_drawdown_minute_close_pct"],
                 sides={s:metrics([r for r in rows[mode] if r["side"]==s]) for s in ("LONG","SHORT")},
                 regimes={s+"_"+g:metrics([r for r in rows[mode] if r["side"]==s and r["regime"]==g])
                          for s in ("LONG","SHORT") for g in ("up","down","range")},
                 trade_evidence=[evidence(r) for r in rows[mode]])
        result[mode] = m
    pair = compare(rows["short_only"],rows["baseline"],start,entry_end,rates is not None)
    short = result["short_only"]
    decision = "descriptive_or_collecting"
    if final:
        if rates is None or any(result[k]["open_position"] for k in MODES):
            decision = "blocked_incomplete_cost_or_exit_evidence"
        elif short["trades"] < 30 or short["active_days"] < 20:
            decision = "insufficient_fixed_window_data"
        elif short["net_after_funding"] <= 0 or short["stress_net"] <= 0 or pair["delta"] <= 0:
            decision = "reject_no_net_edge"
        elif (short["ci95_mean_per_trade"] and short["ci95_mean_per_trade"][0] > 0
              and pair["ci95_daily_delta_2d"] and pair["ci95_daily_delta_2d"][0] > 0):
            decision = "positive_replay_evidence_not_execution_proof"
        else:
            decision = "inconclusive_uncertainty"
    return dict(status="fixed_checkpoint" if final else "descriptive_or_collecting",
                start=iso(start),entry_end=iso(entry_end),observed_through=iso(end),
                modes=result,short_vs_baseline=pair,decision=decision,
                secondary=secondary_report(rows,result,start,entry_end,rates is not None,final),
                exploratory_filters={
                    mode: dict(status="exploratory_only_no_promotion",
                               rule=("15m/45m mean volume >= 1.2" if mode=="volume_rising"
                                     else "60-close realized volatility <= 0.012"),
                               vs_baseline=compare(rows[mode],rows["baseline"],start,entry_end,rates is not None),
                               vs_cash=compare(rows[mode],[],start,entry_end,rates is not None))
                    for mode in FILTER_MODES})

def audit_recorded(bars, start, end):
    """Check the frozen rules against corrected production-paper fills, not legacy."""
    history, _, _ = load_trades("dip_continuation")
    rows = [r for r in history
            if start <= ts(r["entry_at"]) < ts(r["exit_at"]) <= end]
    matched, mismatches = 0, []
    for r in rows:
        a,b = ts(r["entry_at"]),ts(r["exit_at"])
        p = open_position(r["side"],a,bars[a])
        expected = None
        for t in range(a,b,MINUTE):
            decision = exit_decision(p,t,bars[t])
            if decision:
                expected = close_position(p,t+MINUTE,*decision)
                break
        if (signal(bars,a-MINUTE)==r["side"] and expected
                and expected["exit_at"]==iso(b) and expected["reason"]==r["reason"]
                and math.isclose(p["entry"],number(r["entry_price"]),rel_tol=1e-10)
                and math.isclose(expected["exit_price"],number(r["exit_price"]),rel_tol=1e-10)):
            matched += 1
        else:
            mismatches.append(str(r["id"]))
    return dict(checked=len(rows),exact_rule_matches=matched,mismatch_ids=mismatches,
                note="Per-fill rule audit; continuous replay can diverge from runtime tick gaps or starting positions.")

def compact(p):
    return dict(status=p["status"],decision=p.get("decision"),
                modes={k:{f:v[f] for f in ("trades","active_days","net_after_funding",
                       "stress_net","marked_max_drawdown_pct","ci95_mean_per_trade","fees","slippage")}
                       for k,v in p["modes"].items()},
                paired_delta=p.get("short_vs_baseline",{}).get("delta"),
                paired_ci=p.get("short_vs_baseline",{}).get("ci95_daily_delta_2d"),
                secondary_decision=p.get("secondary",{}).get("decision"),
                secondary_comparisons={k:{f:v[f] for f in ("delta","ci97_5_daily_delta_2d",
                       "ci97_5_daily_delta_7d")} for k,v in
                       p.get("secondary",{}).get("comparisons",{}).items()},
                exploratory_filters={mode:{control:{f:pair[f] for f in
                    ("delta","ci95_daily_delta_2d","ci95_daily_delta_7d")}
                    for control,pair in report.items() if control in ("vs_baseline","vs_cash")}
                    for mode,report in p.get("exploratory_filters",{}).items()})

def main(output):
    status = get("/api/research-data")
    if status.get("realOrders") is not False:
        raise ValueError("unexpected non-paper data source")
    latest = get("/api/candles",dict(symbol="SOLUSDT",limit=2))
    if latest.get("symbol") != "SOLUSDT":
        raise ValueError("unexpected latest candle symbol")
    candle_end = min(max(ts(r["start_at"]) for r in latest["candles"])+MINUTE,
                     ts(status["at"])//MINUTE*MINUTE)
    end = min(candle_end,CHECKPOINT+HOLD)
    coverage = next((x["details"].get("fundingCoverage",{}).get("SOLUSDT")
                     for x in status["status"] if x["name"]=="public-research-funding"),None)
    if coverage and coverage.get("complete") is True:
        # Compare only through a common covered time; explicitly report lag.
        covered_end = ts(coverage["requestedTo"])//MINUTE*MINUTE
        if covered_end > START:
            end = min(end,covered_end)
    if end <= START:
        raise ValueError("no replay data")
    bars = load_bars(START-60*MINUTE,end)
    rates, funding_status = load_funding(START,end,status)
    historical_end = min(FORWARD,end)
    historical = phase(bars,rates,START,historical_end,historical_end)
    forward = phase(bars,rates,FORWARD,min(CHECKPOINT,end),end,
                    final=end>=CHECKPOINT+HOLD)
    audit = audit_recorded(bars,START,historical_end)
    report = dict(mode="read-only-independent-paper-replay",real_orders=False,
                  as_of=status["at"],candle_end=iso(candle_end),common_end=iso(end),
                  funding_lag_minutes=max(0,(min(candle_end,CHECKPOINT+HOLD)-end)//MINUTE),
                  confirmed_candles=len(bars),funding_status=funding_status,
                  funding_verified_cashflow=False,capital=CAPITAL,notional=NOTIONAL,
                  fee_per_side=FEE,slippage_per_side=SLIP,extra_stress_per_side=STRESS,
                  prospective_cutoff=iso(FORWARD),fixed_entry_end=iso(CHECKPOINT),
                  fixed_final_observation=iso(CHECKPOINT+HOLD),recorded_fill_audit=audit,
                  historical_descriptive=historical,prospective=forward)
    Path(output).write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
    print("REPLAY_QUALITY",json.dumps({k:report[k] for k in
          ("as_of","candle_end","common_end","funding_lag_minutes","confirmed_candles",
           "funding_status","recorded_fill_audit")},separators=(",",":")))
    print("REPLAY_HISTORICAL",json.dumps(compact(historical),separators=(",",":")))
    print("REPLAY_PROSPECTIVE",json.dumps(compact(forward),separators=(",",":")))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",default="dip-independent-replay.json")
    main(parser.parse_args().output)
