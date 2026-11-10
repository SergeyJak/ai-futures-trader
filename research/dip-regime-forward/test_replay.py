import unittest
from replay import *

def bars_fixture(start, end):
    return {t:(100.,100.1,99.9,100.,100.) for t in range(start-60*MINUTE,end,MINUTE)}

def set_bar(bars,t,o,h,l,c):
    bars[t]=(o,h,l,c,100.)

class ReplayTest(unittest.TestCase):
    def test_exact_signal_and_next_open(self):
        a=FORWARD
        bars=bars_fixture(a,a+3*MINUTE)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        set_bar(bars,a,101,101.1,98,100)
        self.assertEqual(signal(bars,a-MINUTE),"SHORT")
        rows,_=simulate(bars,a,a+3*MINUTE,a+3*MINUTE,"short_only")
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["entry_at"],iso(a))
        self.assertAlmostEqual(rows[0]["entry_price"],101*(1-SLIP))
        self.assertEqual(rows[0]["reason"],"TAKE")
        self.assertEqual(rows[0]["exit_at"],iso(a+MINUTE))
        self.assertGreater(rows[0]["fee"],0)
        self.assertGreater(rows[0]["slippage"],0)

    def test_stop_first_and_gap(self):
        a=FORWARD
        p=open_position("SHORT",a,(100,100,100,100,1))
        stop=p["entry"]*(1+STOP)
        self.assertEqual(exit_decision(p,a,(100,103,97,100,1)),(stop,"BOTH_STOP_FIRST"))
        self.assertEqual(exit_decision(p,a+MINUTE,(103,104,102,103,1)),(103,"STOP"))
        p=open_position("LONG",a,(100,100,100,100,1))
        self.assertEqual(exit_decision(p,a+MINUTE,(97,98,96,97,1)),(97,"STOP"))

    def test_time_exit_and_no_same_bar_reentry(self):
        a=FORWARD
        end=a+HOLD+2*MINUTE
        bars=bars_fixture(a,end)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        set_bar(bars,a+HOLD-MINUTE,100,100.9,99.9,100.8)
        rows,mark=simulate(bars,a,end,end,"short_only")
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["reason"],"TIME")
        self.assertEqual(rows[0]["exit_at"],iso(a+HOLD))
        self.assertIsNone(mark)

    def test_independent_short_frees_capacity(self):
        a=FORWARD
        end=a+8*MINUTE
        bars=bars_fixture(a,end)
        set_bar(bars,a-MINUTE,100,100,99.3,99.4) # LONG
        set_bar(bars,a,100,100.1,99.8,100)
        set_bar(bars,a+MINUTE,100,100.9,99.9,100.8) # SHORT
        set_bar(bars,a+2*MINUTE,100.7,100.8,98,100.1) # SHORT take; LONG stop
        base,_=simulate(bars,a,end,end,"baseline")
        short,_=simulate(bars,a,end,end,"short_only")
        self.assertEqual(base[0]["side"],"LONG")
        self.assertEqual(short[0]["side"],"SHORT")
        self.assertEqual(short[0]["entry_at"],iso(a+2*MINUTE))
        self.assertNotEqual(base[0]["entry_at"],short[0]["entry_at"])

    def test_prefix_and_open_mark_not_closed(self):
        a=FORWARD
        bars=bars_fixture(a,a+HOLD+MINUTE)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        early,mark=simulate(bars,a,a+5*MINUTE,a+5*MINUTE,"short_only")
        self.assertEqual(early,[])
        self.assertEqual(mark["reason"],"OPEN_MARK")
        late,_=simulate(bars,a,a+5*MINUTE,a+HOLD+MINUTE,"short_only")
        self.assertEqual(late[0]["entry_at"],mark["entry_at"])
        self.assertEqual(late[0]["entry_price"],mark["entry_price"])
        self.assertEqual(late[0]["exit_at"],iso(a+HOLD))

    def test_missing_bar_fails_closed(self):
        a=FORWARD
        bars=bars_fixture(a,a+3*MINUTE)
        del bars[a+MINUTE]
        with self.assertRaisesRegex(ValueError,"missing confirmed candle"):
            simulate(bars,a,a+3*MINUTE,a+3*MINUTE,"baseline")

    def test_paired_calendar_days_not_trade_matching(self):
        a=FORWARD
        short=[dict(a=a+DAY,after=.3,before=.2)]
        base=[dict(a=a,after=-.1,before=-.2),dict(a=a+2*DAY,after=.2,before=.1)]
        pair=compare(short,base,a,a+4*DAY,True)
        self.assertAlmostEqual(pair["delta"],.2)
        self.assertEqual(pair["calendar_days"],4)
        self.assertEqual(pair["daily_delta"][-1]["delta"],0)
        self.assertEqual(pair["ci95_daily_delta_2d"],compare(short,base,a,a+4*DAY,True)["ci95_daily_delta_2d"])

    def test_short_up_uses_only_prior_closes_and_frees_capacity(self):
        a=FORWARD
        end=a+5*MINUTE
        bars=bars_fixture(a,end)
        set_bar(bars,a-60*MINUTE,101,101.1,100.9,101)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        set_bar(bars,a,100.8,101,100.7,100.9)
        set_bar(bars,a+MINUTE,100.9,101,98,100)
        self.assertEqual(signal(bars,a-MINUTE),"SHORT")
        self.assertFalse(accepts(SECONDARY_MODE,"SHORT",bars,a-MINUTE))
        self.assertTrue(accepts(SECONDARY_MODE,"SHORT",bars,a))
        self.assertFalse(accepts(SECONDARY_MODE,"LONG",bars,a))
        short,_=simulate(bars,a,end,end,"short_only")
        filtered,_=simulate(bars,a,end,end,SECONDARY_MODE)
        self.assertEqual(short[0]["entry_at"],iso(a))
        self.assertEqual(filtered[0]["entry_at"],iso(a+MINUTE))
        self.assertEqual(filtered[0]["reason"],"TAKE")
        # Changing the future entry candle cannot change the entry predicate.
        set_bar(bars,a+MINUTE,90,120,80,110)
        self.assertTrue(accepts(SECONDARY_MODE,"SHORT",bars,a))

    def test_volume_filter_independent_capacity_and_causality(self):
        a=FORWARD
        end=a+5*MINUTE
        bars=bars_fixture(a,end)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        bars[a]=(100.8,100.9,100.7,100.8,500.)
        bars[a+MINUTE]=(100.8,101.1,100.7,101.,500.)
        set_bar(bars,a+2*MINUTE,101,101.2,98,100)
        self.assertFalse(accepts("volume_rising","SHORT",bars,a-MINUTE))
        self.assertTrue(accepts("volume_rising","SHORT",bars,a+MINUTE))
        base,_=simulate(bars,a,end,end,"baseline")
        filtered,_=simulate(bars,a,end,end,"volume_rising")
        self.assertEqual(base[0]["entry_at"],iso(a))
        self.assertEqual(filtered[0]["entry_at"],iso(a+2*MINUTE))
        self.assertEqual(filtered[0]["reason"],"TAKE")
        bars[a+2*MINUTE]=(101,101.2,98,100,0.)
        self.assertTrue(accepts("volume_rising","SHORT",bars,a+MINUTE))
        # Zero prior volume cannot be interpreted as a rising-volume signal.
        for t in range(a-60*MINUTE,a-15*MINUTE,MINUTE):
            bars[t]=(*bars[t][:4],0.)
        self.assertFalse(accepts("volume_rising","SHORT",bars,a-MINUTE))

    def test_volatility_filter_uses_only_confirmed_history(self):
        a=FORWARD
        bars=bars_fixture(a,a+3*MINUTE)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        self.assertTrue(accepts("moderate_volatility","SHORT",bars,a-MINUTE))
        self.assertTrue(accepts("moderate_volatility","LONG",bars,a-MINUTE))
        set_bar(bars,a,100,150,50,140)
        self.assertTrue(accepts("moderate_volatility","SHORT",bars,a-MINUTE))
        set_bar(bars,a-30*MINUTE,100,102,99.9,102)
        self.assertFalse(accepts("moderate_volatility","SHORT",bars,a-MINUTE))

    def test_filter_report_keeps_exploratory_status_and_missing_costs(self):
        a=FORWARD
        end=a+3*MINUTE
        bars=bars_fixture(a,end)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        set_bar(bars,a,101,101.1,98,100)
        p=phase(bars,None,a,end,end,final=True)
        for mode in FILTER_MODES:
            self.assertIsNone(p["modes"][mode]["net_after_funding"])
            report=p["exploratory_filters"][mode]
            self.assertEqual(report["status"],"exploratory_only_no_promotion")
            self.assertEqual(report["vs_cash"]["basis"],"before funding")
            self.assertEqual(report["vs_baseline"]["calendar_days"],1)
        self.assertEqual(p["decision"],"blocked_incomplete_cost_or_exit_evidence")

    def test_secondary_fixed_decision_and_cost_gate(self):
        a=FORWARD
        end=a+30*DAY
        def cohort(pnl):
            return [dict(a=a+i*DAY,after=pnl,before=pnl) for i in range(30)]
        rows={SECONDARY_MODE:cohort(.1),"short_only":cohort(.02),"baseline":cohort(-.05)}
        result={k:dict(open_position=None,trades=30,active_days=30,
                       net_after_funding=3.,stress_net=2.) for k in rows}
        report=secondary_report(rows,result,a,end,True,True)
        self.assertEqual(report["decision"],"positive_secondary_replay_evidence_not_execution_proof")
        self.assertAlmostEqual(report["comparisons"]["short_only"]["delta"],2.4)
        self.assertGreater(report["comparisons"]["cash"]["ci97_5_daily_delta_7d"][0],0)
        self.assertEqual(secondary_report(rows,result,a,end,True,False)["decision"],
                         "descriptive_or_collecting")
        self.assertEqual(secondary_report(rows,result,a,end,False,True)["decision"],
                         "blocked_incomplete_cost_or_exit_evidence")
        result[SECONDARY_MODE]["stress_net"]=-.01
        self.assertEqual(secondary_report(rows,result,a,end,True,True)["decision"],
                         "reject_no_net_edge")
        result[SECONDARY_MODE]["active_days"]=19
        self.assertEqual(secondary_report(rows,result,a,end,True,True)["decision"],
                         "insufficient_fixed_window_data")

    def test_no_future_or_missing_funding_edge(self):
        a=FORWARD
        bars=bars_fixture(a,a+3*MINUTE)
        set_bar(bars,a-MINUTE,100,101,99.9,100.8)
        set_bar(bars,a,101,101.1,98,100)
        p=phase(bars,None,a,a+3*MINUTE,a+3*MINUTE,final=True)
        self.assertEqual(p["decision"],"blocked_incomplete_cost_or_exit_evidence")
        self.assertIsNone(p["modes"]["short_only"]["net_after_funding"])
        self.assertEqual(phase(bars,{},a,a,a)["status"],"waiting_for_new_data")

if __name__=="__main__":
    unittest.main()
