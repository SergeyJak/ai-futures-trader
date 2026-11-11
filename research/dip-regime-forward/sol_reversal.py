"""Read-only SOL reversal replay and corrected-fill audit; no account or order writes."""
import argparse
import json
import math
from pathlib import Path

from study import (MINUTE, DAY, CAPITAL, NOTIONAL, FEE, SLIP, STRESS,
                   ts, iso, number, get, load_funding, score, metrics)
from replay import load_bars, require_bars, open_position, close_position, compare, evidence

START = ts("2026-10-15T00:00:00Z")
FORWARD = ts("2026-11-12T00:00:00Z")
CHECKPOINT = FORWARD + 30*DAY
FINAL = CHECKPOINT + 7*DAY
SIDES = ("LONG", "SHORT")
VARIANTS = {"30m": 30, "4h": 240, "unlimited": None}
CANDIDATE = "SHORT/unlimited"
CONTROL = "SHORT/4h"
STOP, TAKE = .01, .02

def signal(bars, t, side):
    first, move, last = (bars[t-3*MINUTE][3], bars[t-MINUTE][3], bars[t][3])
    return (move/first <= .995 and last > move) if side == "LONG" else (
        move/first >= 1.005 and last < move)

def exit_decision(p, t, bar, minutes, conservative=True):
    o,h,l,c,_ = bar
    d = 1 if p["side"] == "LONG" else -1
    stop, take = p["entry"]*(1-d*STOP), p["entry"]*(1+d*TAKE)
    if (l <= stop if d == 1 else h >= stop):
        # Runtime uses close and stop; independent replay also protects against
        # an adverse gap at the open. Never use a favorable intrabar ordering.
        prices = (c, stop, o) if conservative else (c, stop)
        return (min(prices) if d == 1 else max(prices), "STOP")
    if (h >= take if d == 1 else l <= take):
        return take, "TAKE"
    if minutes is not None and t+MINUTE-p["a"] >= minutes*MINUTE:
        return c, "TIME"
    return None

def simulate(bars, start, entry_end, end, side, variant):
    if side not in SIDES or variant not in VARIANTS or not start <= entry_end <= end:
        raise ValueError("invalid replay configuration")
    if any(t % MINUTE for t in (start,entry_end,end)):
        raise ValueError("unaligned replay boundaries")
    require_bars(bars,start-60*MINUTE,end)
    rows, p, pending = [], None, False
    for t in range(start-MINUTE,end,MINUTE):
        occupied = p is not None or pending
        if pending:
            if t >= entry_end:
                raise ValueError("entry outside frozen window")
            p = open_position(side,t,bars[t])
            pending = False
        if p is not None:
            decision = exit_decision(p,t,bars[t],VARIANTS[variant])
            if decision:
                rows.append(close_position(p,t+MINUTE,*decision))
                p = None
        elif not occupied and start <= t+MINUTE < entry_end and signal(bars,t,side):
            pending = True
    mark = close_position(p,end,bars[end-MINUTE][3],"OPEN_MARK") if p is not None else None
    return rows, mark

def scored(raw, candles, rates):
    out = score(raw,candles,rates,max_duration=None)
    out.update(reason=raw["reason"],fee=raw.get("fee"),slippage=raw.get("slippage"))
    return out

def summary(rows, rates):
    m = metrics(rows)
    if rates is None:
        m.update(net_after_funding=None,return_on_100_pct=None,stress_net=None,funding=None,
                 drawdown_basis="before funding")
    return m

def decide(m, pairs, funded, open_positions, final):
    if not final:
        return "descriptive_or_collecting"
    if not funded or open_positions:
        return "blocked_incomplete_cost_or_exit_evidence"
    if m["trades"] < 30 or m["active_days"] < 20:
        return "insufficient_fixed_window_data"
    if m["net_after_funding"] <= 0 or m["stress_net"] <= 0 or any(p["delta"] <= 0 for p in pairs.values()):
        return "reject_no_net_edge"
    if (m["ci95_mean_per_trade"] and m["ci95_mean_per_trade"][0] > 0
        and all(p[k] and p[k][0] > 0 for p in pairs.values()
                for k in ("ci95_daily_delta_2d","ci95_daily_delta_7d"))):
        return "positive_secondary_paper_evidence_not_execution_proof"
    return "inconclusive_uncertainty"

def phase(bars, rates, start, entry_end, end, final=False):
    if entry_end <= start:
        return dict(status="waiting_for_new_data",modes={})
    candles = {t:(b[3],b[4]) for t,b in bars.items()}
    rows, result = {}, {}
    for side in SIDES:
        for variant in VARIANTS:
            key = side+"/"+variant
            raw, mark = simulate(bars,start,entry_end,end,side,variant)
            rows[key] = [scored(r,candles,rates) for r in raw]
            open_row = scored(mark,candles,rates) if mark else None
            m = summary(rows[key],rates)
            marked = summary(rows[key]+([open_row] if open_row else []),rates)
            m.update(fees=sum(r["fee"] for r in rows[key]),
                     slippage=sum(r["slippage"] for r in rows[key]),
                     open_position=evidence(open_row) if open_row else None,
                     marked_net_after_funding=marked["net_after_funding"],
                     marked_max_drawdown_pct=marked["max_drawdown_minute_close_pct"],
                     regimes={g:summary([r for r in rows[key] if r["regime"]==g],rates)
                              for g in ("up","down","range")},
                     trade_evidence=[evidence(r) for r in rows[key]])
            result[key] = m
    pairs = {name:compare(rows[CANDIDATE],control,start,entry_end,rates is not None)
             for name,control in (("cash",[]),("short_4h",rows[CONTROL]))}
    decision = decide(result[CANDIDATE],pairs,rates is not None,
                      any(result[k]["open_position"] for k in (CANDIDATE,CONTROL)),final)
    return dict(status="fixed_checkpoint" if final else "descriptive_or_collecting",
                start=iso(start),entry_end=iso(entry_end),observed_through=iso(end),
                modes=result,comparisons=pairs,decision=decision)

def audit_history(report, side, bars, rates, end):
    """Recorded corrected fills only. A capped UI history never masquerades as complete."""
    if (report.get("realOrders") is not False or report.get("mode") != "forward-paper-only"
            or report.get("symbol") != "SOLUSDT" or report.get("side") != side):
        raise ValueError("unexpected SOL paper history")
    candles = {t:(b[3],b[4]) for t,b in bars.items()}
    result = {}
    for variant in VARIANTS:
        v = next(v for v in report["variants"] if v["id"]==variant)
        total = v["postFixClosedTrades"]
        if type(total) is not int or total < 0:
            raise ValueError("invalid corrected history count")
        corrected = [r for r in v["trades"] if r.get("execution_model")=="next-open-v2"]
        if len(corrected)>total:
            raise ValueError("inconsistent corrected history count")
        rows = [r for r in corrected if START <= ts(r["entry_at"]) < ts(r["exit_at"]) <= end]
        quality = dict(total_corrected=total,loaded_corrected=len(corrected),
                       complete_history=len(corrected)==total,eligible=len(rows),
                       outside_window=len(corrected)-len(rows),duplicates=0,overlaps=0,
                       invalid=0,exact_rule_matches=0,mismatch_ids=[])
        scored_rows, seen, last_exit = [], set(), -1
        for r in sorted(rows,key=lambda r:(ts(r["entry_at"]),str(r["id"]))):
            a,b = ts(r["entry_at"]),ts(r["exit_at"])
            if str(r["id"]) in seen:
                quality["duplicates"]+=1
                continue
            seen.add(str(r["id"]))
            if a < last_exit:
                quality["overlaps"]+=1
                continue
            last_exit=b
            try:
                if r.get("variant")!=variant:
                    raise ValueError("wrong variant")
                row = scored(dict(r,side=side),candles,rates)
                if VARIANTS[variant] is not None and b-a>VARIANTS[variant]*MINUTE:
                    raise ValueError("time exit exceeded")
                p = open_position(side,a,bars[a])
                expected = None
                for t in range(a,b,MINUTE):
                    decision = exit_decision(p,t,bars[t],VARIANTS[variant],conservative=False)
                    if decision:
                        expected=close_position(p,t+MINUTE,*decision)
                        break
                matched=(signal(bars,a-MINUTE,side) and expected is not None
                         and expected["exit_at"]==iso(b) and expected["reason"]==r["reason"]
                         and math.isclose(p["entry"],number(r["entry_price"]),rel_tol=1e-10)
                         and math.isclose(expected["exit_price"],number(r["exit_price"]),rel_tol=1e-10))
                if matched:
                    quality["exact_rule_matches"]+=1
                else:
                    quality["mismatch_ids"].append(str(r["id"]))
                scored_rows.append(row)
            except (ValueError,KeyError,TypeError):
                quality["invalid"]+=1
        valid=quality["complete_history"] and not any(quality[k] for k in ("duplicates","overlaps","invalid"))
        result[side+"/"+variant]=dict(quality=quality,metrics=summary(scored_rows,rates) if valid else None,
                                     trade_evidence=[evidence(r) for r in scored_rows] if valid else [])
    return result

def compact(p):
    return dict(status=p["status"],decision=p.get("decision"),
                modes={k:{f:v[f] for f in ("trades","active_days","net_after_funding","stress_net",
                        "marked_max_drawdown_pct","ci95_mean_per_trade","fees","slippage")}
                       for k,v in p["modes"].items()},
                comparisons={k:{f:v[f] for f in ("delta","ci95_daily_delta_2d","ci95_daily_delta_7d")}
                             for k,v in p.get("comparisons",{}).items()})

def main(output):
    status=get("/api/research-data")
    if status.get("realOrders") is not False:
        raise ValueError("unexpected non-paper data source")
    latest=get("/api/candles",dict(symbol="SOLUSDT",limit=2))
    if latest.get("symbol")!="SOLUSDT":
        raise ValueError("unexpected candle symbol")
    candle_end=min(max(ts(r["start_at"]) for r in latest["candles"])+MINUTE,
                   ts(status["at"])//MINUTE*MINUTE)
    end=min(candle_end,FINAL)
    coverage=next((x["details"].get("fundingCoverage",{}).get("SOLUSDT")
                   for x in status["status"] if x["name"]=="public-research-funding"),None)
    if coverage and coverage.get("complete") is True:
        covered_end=ts(coverage["requestedTo"])//MINUTE*MINUTE
        if covered_end>START:
            end=min(end,covered_end)
    if end<=START:
        raise ValueError("no replay data")
    bars=load_bars(START-60*MINUTE,end)
    rates,funding_status=load_funding(START,end,status)
    historical_end=min(FORWARD,end)
    historical=phase(bars,rates,START,historical_end,historical_end)
    forward=phase(bars,rates,FORWARD,min(CHECKPOINT,end),end,final=end>=FINAL)
    recorded={}
    for side,path in (("LONG","/api/sol-dip"),("SHORT","/api/sol-short")):
        recorded.update(audit_history(get(path),side,bars,rates,historical_end))
    report=dict(mode="read-only-sol-reversal-paper-replay",real_orders=False,
                as_of=status["at"],common_end=iso(end),candle_end=iso(candle_end),
                confirmed_candles=len(bars),funding_status=funding_status,
                funding_verified_cashflow=False,capital=CAPITAL,notional=NOTIONAL,
                fee_per_side=FEE,slippage_per_side=SLIP,extra_stress_per_side=STRESS,
                prospective_cutoff=iso(FORWARD),fixed_entry_end=iso(CHECKPOINT),
                fixed_final_observation=iso(FINAL),candidate=CANDIDATE,control=CONTROL,
                historical_descriptive=historical,prospective=forward,recorded_corrected=recorded)
    Path(output).write_text(json.dumps(report,indent=2,allow_nan=False)+"\n")
    print("SOL_REVERSAL_QUALITY",json.dumps({k:report[k] for k in
          ("as_of","common_end","candle_end","confirmed_candles","funding_status")},separators=(",",":")))
    print("SOL_REVERSAL_HISTORICAL",json.dumps(compact(historical),separators=(",",":")))
    print("SOL_REVERSAL_PROSPECTIVE",json.dumps(compact(forward),separators=(",",":")))
    print("SOL_REVERSAL_RECORDED",json.dumps({k:dict(quality=v["quality"],metrics=v["metrics"])
          for k,v in recorded.items()},separators=(",",":")))

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",default="sol-reversal-report.json")
    main(parser.parse_args().output)
