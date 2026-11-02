import unittest
from audit import funding_cashflow


class FundingTests(unittest.TestCase):
    def setUp(self):
        self.trade = dict(side='LONG', quantity=2, entry_at=1, exit_at=60000)
        self.rates = {0: 0.001, 28800: 0.001, 57600: -0.0005, 86400: 0.001}
        self.prices = {28740: 100, 57540: 120}

    def test_signed_funding_uses_each_settlement_price(self):
        # Long pays .2, then receives .12. Short receives the inverse.
        self.assertAlmostEqual(funding_cashflow(self.trade, self.rates, self.prices)['estimate'], -.08)
        self.trade['side'] = 'SHORT'
        self.assertAlmostEqual(funding_cashflow(self.trade, self.rates, self.prices)['estimate'], .08)

    def test_missing_settlement_or_price_withholds_the_total(self):
        del self.rates[28800]
        self.assertIsNone(funding_cashflow(self.trade, self.rates, self.prices)['estimate'])
        self.rates[28800] = .001
        del self.prices[28740]
        self.assertIsNone(funding_cashflow(self.trade, self.rates, self.prices)['estimate'])

    def test_boundary_settlement_is_ambiguous_not_silently_charged(self):
        self.trade.update(entry_at=28800, exit_at=57600)
        result = funding_cashflow(self.trade, self.rates, self.prices)
        self.assertEqual(result['estimate'], 0)
        self.assertEqual(result['boundary_events'], 2)
        self.assertAlmostEqual(result['boundary_min'], -.2)
        self.assertAlmostEqual(result['boundary_max'], .12)

    def test_empty_history_cannot_verify_zero_funding(self):
        self.trade.update(entry_at=100, exit_at=200)
        self.assertIsNone(funding_cashflow(self.trade, {}, self.prices)['estimate'])
        self.assertEqual(funding_cashflow(self.trade, self.rates, self.prices)['estimate'], 0)

    def test_zero_rate_requires_no_price_to_establish_zero_cashflow(self):
        self.rates[28800] = 0
        self.rates[57600] = 0
        self.assertEqual(funding_cashflow(self.trade, self.rates, {})['estimate'], 0)

    def test_same_minute_entry_exit_preserves_timestamp_uncertainty(self):
        self.trade.update(entry_at=28800, exit_at=28800)
        result = funding_cashflow(self.trade, self.rates, self.prices)
        self.assertEqual(result['estimate'], 0)
        self.assertEqual(result['boundary_events'], 1)
        self.assertAlmostEqual(result['boundary_min'], -.2)


if __name__ == '__main__':
    unittest.main()
