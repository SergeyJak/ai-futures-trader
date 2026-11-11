import unittest

from study import MINUTE, DAY, iso, score
from sol_reversal import (signal, exit_decision, simulate, phase, decide, audit_history,
                          START, CANDIDATE, CONTROL)

def bars(start, end, price=100.0):
    return {t:(price,price,price,price,1.0) for t in range(start-60*MINUTE,end,MINUTE)}

class SolReversalTest(unittest.TestCase):
    def test_short_signal_next_open_and_stop_first(self):
        a=START
        data=bars(a,a+4*MINUTE)
        data[a-4*MINUTE]=(100,100,100,100,1)
        data[a-2*MINUTE]=(101,101,101,101,1)
        data[a-MINUTE]=(100.5,100.5,100.5,100.5,1)
        data[a]=(100,103,97,100,1)
        self.assertTrue(signal(data,a-MINUTE,"SHORT"))
        rows,mark=simulate(data,a,a+4*MINUTE,a+4*MINUTE,"SHORT","unlimited")
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["entry_at"],iso(a))
        self.assertEqual(rows[0]["exit_at"],iso(a+MINUTE))
        self.assertEqual(rows[0]["reason"],"STOP")
        self.assertAlmostEqual(rows[0]["entry_price"],99.97)
        self.assertIsNone(mark)

    def test_adverse_gap_and_runtime_audit_distinct(self):
        p=dict(side="SHORT",a=START,entry=100)
        b=(103,104,100,100,1)
        self.assertEqual(exit_decision(p,START,b,None),(103,"STOP"))
        self.assertEqual(exit_decision(p,START,b,None,False),(101,"STOP"))

    def test_unlimited_not_forced_and_funding_longer_than_12h(self):
        a=START
        end=a+13*60*MINUTE
        data=bars(a,end)
        data[a-2*MINUTE]=(101,101,101,101,1)
        data[a-MINUTE]=(100.5,100.5,100.5,100.5,1)
        rows,mark=simulate(data,a,end,end,"SHORT","unlimited")
        self.assertEqual(rows,[])
        self.assertEqual(mark["reason"],"OPEN_MARK")
        candles={t:(b[3],b[4]) for t,b in data.items()}
        with self.assertRaises(ValueError):
            score(mark,candles,{})
        scored=score(mark,candles,{a+8*60*MINUTE:.001},max_duration=None)
        self.assertGreater(scored["funding"],0)
        self.assertEqual(scored["funding_events"],1)
        rows,mark=simulate(data,a,end,end,"SHORT","4h")
        self.assertEqual(rows[0]["reason"],"TIME")
        self.assertEqual(rows[0]["exit_at"],iso(a+240*MINUTE))
        self.assertIsNone(mark)

    def test_missing_funding_not_zero_and_no_early_promotion(self):
        a=START
        data=bars(a,a+3*MINUTE)
        p=phase(data,None,a,a+3*MINUTE,a+3*MINUTE)
        self.assertIsNone(p["modes"][CANDIDATE]["net_after_funding"])
        self.assertEqual(p["decision"],"descriptive_or_collecting")
        self.assertEqual(decide({}, {},False,False,True),"blocked_incomplete_cost_or_exit_evidence")
        self.assertEqual(decide({}, {},True,True,True),"blocked_incomplete_cost_or_exit_evidence")
        self.assertEqual(decide({"trades":29,"active_days":20},{},True,False,True),
                         "insufficient_fixed_window_data")

    def test_capped_history_is_not_complete(self):
        a=START
        data=bars(a,a+3*MINUTE)
        report=dict(realOrders=False,mode="forward-paper-only",symbol="SOLUSDT",side="SHORT",
                    variants=[dict(id=v,postFixClosedTrades=1,trades=[]) for v in ("30m","4h","unlimited")])
        result=audit_history(report,"SHORT",data,{},a+3*MINUTE)
        self.assertFalse(result[CANDIDATE]["quality"]["complete_history"])
        self.assertIsNone(result[CANDIDATE]["metrics"])
        report.pop("side")
        self.assertEqual(audit_history(report,"SHORT",data,{},a+3*MINUTE)[CANDIDATE]["quality"]["side_source"],
                         "dedicated_endpoint")
        report["side"]="LONG"
        with self.assertRaises(ValueError):
            audit_history(report,"SHORT",data,{},a+3*MINUTE)

if __name__=="__main__":
    unittest.main()
