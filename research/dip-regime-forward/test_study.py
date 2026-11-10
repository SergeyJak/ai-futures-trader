import unittest
from unittest.mock import patch
from urllib.error import HTTPError
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
    def test_research_history_preserves_more_than_ui_limit(self):
        row, _, _, _ = fixture()
        rows = [dict(row, id=i, variant="12h") for i in range(180)]
        report = dict(mode="forward-paper-research-history", realOrders=False,
                      strategy="dip_continuation", variant="12h", executionModel="next-open-v2",
                      total=180, possiblyTruncated=False, trades=rows)
        with patch("study.get", return_value=report) as get_mock:
            loaded, total, truncated = load_trades("dip_continuation")
        self.assertEqual((len(loaded), total, truncated), (180, 180, False))
        get_mock.assert_called_once_with("/api/strategy-paper/dip_continuation/research-history")
        for bad in (dict(report, total=181), dict(report, possiblyTruncated=True),
                    dict(report, trades=rows[:-1]+[dict(rows[-1], execution_model="legacy-close-v1")])):
            with patch("study.get", return_value=bad), self.assertRaises(ValueError):
                load_trades("dip_continuation")

    def test_old_report_fallback_only_when_complete(self):
        row, _, _, _ = fixture()
        rows = [dict(row, id=i, variant="12h") for i in range(150)]
        old = dict(mode="forward-paper", realOrders=False, variants=[
            dict(id="12h", trades=rows, postFixClosedTrades=150)])
        missing = HTTPError("http://test", 404, "not deployed", {}, None)
        with patch("study.get", side_effect=[missing, old]):
            self.assertEqual(load_trades("dip_continuation"), (rows, 150, False))
        old["variants"][0]["postFixClosedTrades"] = 151
        with patch("study.get", side_effect=[missing, old]), self.assertRaisesRegex(ValueError, "incomplete"):
            load_trades("dip_continuation")
        unavailable = HTTPError("http://test", 503, "unavailable", {}, None)
        with patch("study.get", side_effect=unavailable), self.assertRaises(HTTPError):
            load_trades("dip_continuation")

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

    def test_primary_checkpoint_does_not_move_with_later_outcomes(self):
        row,candles,a,b=fixture("SHORT",start="2026-11-11T00:00:00Z")
        x=score(row,candles,{})
        rows=[dict(x,id=str(i),a=a+(i//2)*DAY+(i%2)*13*3600,
                   b=a+(i//2)*DAY+(i%2)*13*3600+12*3600) for i in range(40)]
        checkpoint=primary_checkpoint(rows,PRIMARY,a+22*DAY,True)
        self.assertEqual(checkpoint["status"],"fixed_checkpoint")
        self.assertEqual(checkpoint["candidate"]["trades"],40)
        extra=dict(x,id="later",a=a+21*DAY,b=a+21*DAY+12*3600,after=99)
        self.assertEqual(primary_checkpoint(rows+[extra],PRIMARY,a+23*DAY,True),checkpoint)
        self.assertEqual(primary_checkpoint(rows,PRIMARY,a+20*DAY,True)["status"],"collecting")

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
