import unittest
from study import *

def fixture(side="LONG", start="2026-11-01T00:00:00Z", hours=12):
    a = ts(start)
    b = a + hours*3600
    row = dict(id=1, side=side, entry_at=iso(a), exit_at=iso(b),
               entry_price=100, exit_price=102, net_pnl=.18, execution_model="next-open-v2")
    candles = {t:(100+(t-a)/MINUTE*.001, 150 if t>=a-15*MINUTE else 100)
               for t in range(a-60*MINUTE,b,MINUTE)}
    return row, candles, a, b

class StudyTest(unittest.TestCase):
    def test_cost_and_funding_direction(self):
        row, candles, a, b = fixture()
        rates = {a+8*3600:.001}
        x = score(row,candles,rates)
        self.assertAlmostEqual(x["before"],.18788)
        self.assertLess(x["funding"],0)
        self.assertLess(x["after"],x["before"])
        self.assertLess(x["stress"],x["after"])
        row["side"]="SHORT"
        self.assertGreater(score(row,candles,rates)["funding"],0)

    def test_boundary_adverse_and_missing_funding(self):
        row,candles,a,b=fixture()
        x=score(row,candles,{a:.001,b:-.001})
        self.assertLess(x["boundary_funding"],0)
        self.assertAlmostEqual(x["funding"],x["boundary_funding"])
        self.assertIsNone(score(row,candles,None)["after"])
        self.assertIsNone(metrics([score(row,candles,None)])["net_after_funding"])

    def test_duplicate_overlap_gap(self):
        row,candles,a,b=fixture()
        later=dict(row,id=2,entry_at=iso(a+60),exit_at=iso(b-60))
        out,q=clean([row,row,later],candles,{})
        self.assertEqual(len(out),1)
        self.assertEqual(q["duplicates"],1)
        self.assertEqual(q["overlaps"],1)
        del candles[a+60]
        out,q=clean([row],candles,{})
        self.assertEqual(q["missing_history"],1)

    def test_purge_crossing_and_new_cutoff(self):
        row,candles,a,b=fixture(start="2026-11-10T20:00:00Z")
        x=score(row,candles,{})
        q=dict(duplicates=0,overlaps=0,missing_history=0,invalid=0)
        phases=split([x],q)
        self.assertEqual(q["purged_cross_boundary"],1)
        self.assertEqual(phases["prospective"]["baseline"]["trades"],0)

    def test_short_only_is_primary_and_uses_same_opportunities(self):
        row,candles,a,b=fixture("SHORT")
        x=score(row,candles,{})
        self.assertTrue(x["short_only"])
        y=dict(x,id="2",a=a+DAY,b=b+DAY,side="LONG",short_only=False,after=-.2)
        result=group([x,y])
        self.assertEqual(result["filters"]["short_only"]["trades"],1)
        self.assertAlmostEqual(result["filters"]["short_only"]["paired_delta"],.2)
        self.assertEqual(result["filters"]["short_only"]["decision"],"insufficient_forward_data")

    def test_paired_skips_and_bootstrap(self):
        row,candles,a,b=fixture()
        x=score(row,candles,{})
        x.update(trend_aligned=False,after=-.1,stress=-.11)
        y=dict(x,id="2",a=a+DAY,b=b+DAY,after=.2,stress=.19,trend_aligned=True)
        result=group([x,y])
        self.assertAlmostEqual(result["filters"]["trend_aligned"]["paired_delta"],.1)
        self.assertEqual(result["filters"]["trend_aligned"]["trades"],1)
        self.assertEqual(result["filters"]["trend_aligned"]["decision"],"descriptive_or_secondary")
        self.assertEqual(result["filters"]["short_only"]["decision"],"insufficient_forward_data")
        self.assertIsNotNone(block_ci([x,y],[-.1,.2]))
        self.assertEqual(block_ci([x,y],[-.1,.2]),block_ci([x,y],[-.1,.2]))

if __name__=="__main__":
    unittest.main()
