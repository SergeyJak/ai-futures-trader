import unittest
from engine import select_basket, execution_cost
class EngineChecks(unittest.TestCase):
 def test_fees_and_slip_always_cost_money(self):
  self.assertAlmostEqual(execution_cost(2,100,.0006,.0003),.180036)
  self.assertEqual(execution_cost(-2,100,.0006,.0003),execution_cost(2,100,.0006,.0003))
 def test_selection_ignores_current_day_and_future(self):
  rows={s:[[i*86400000,1,1,1,1+(k+1)*i/100,0,0,100000000] for i in range(40)] for k,s in enumerate('ABCD')}
  a=select_basket(rows,31*86400000)
  for rs in rows.values():
   for r in rs[31:]:r[4]=999999
  self.assertEqual(a,select_basket(rows,31*86400000))
  self.assertEqual(a,{'A':1,'B':1,'C':-1,'D':-1})

from engine import replay,SYMBOLS,HOUR,DAY
class ReplayChecks(unittest.TestCase):
 def inputs(self):
  start=31*DAY+HOUR;end=start+HOUR
  daily={s:[[i*DAY,100,200,1,100+(k+1)*i,0,0,1e8] for i in range(40)] for k,s in enumerate(SYMBOLS)}
  hourly={s:{t:[t,100,101,99,100] for t in [start,end]} for s in SYMBOLS}
  funding={s:{} for s in SYMBOLS}
  rules={s:{'MARKET_LOT_SIZE':{'stepSize':'.01','minQty':'.01','maxQty':'100'},'MIN_NOTIONAL':{'notional':'5'}} for s in SYMBOLS}
  return daily,hourly,funding,rules,start,end
 def test_flat_prices_lose_exact_execution_costs(self):
  r=replay(*self.inputs())
  self.assertAlmostEqual(r['final'],100-sum(e['cost'] for e in r['events']))
  self.assertFalse(r['curve'][-1]['positions'])
 def test_forward_endpoint_keeps_open_positions_and_exit_reserve(self):
  r=replay(*self.inputs(),liquidate_at_end=False)
  self.assertEqual(len(r['curve'][-1]['positions']),4)
  self.assertLess(r['final'],r['cash'])
 def test_missing_hour_fails(self):
  args=self.inputs();del args[1]['BTCUSDT'][args[4]]
  with self.assertRaises(ValueError):replay(*args)

class BoundaryChecks(ReplayChecks):
 def test_endpoint_high_low_cannot_change_open_boundary_risk(self):
  args=self.inputs();before=replay(*args,liquidate_at_end=False)
  for rows in args[1].values():rows[args[-1]][2]=1e9;rows[args[-1]][3]=.0001
  after=replay(*args,liquidate_at_end=False)
  self.assertEqual(before['simultaneous_hour_extremes_bound_pct'],after['simultaneous_hour_extremes_bound_pct'])
 def test_stale_daily_window_not_a_signal(self):
  args=self.inputs();daily={s:rows[:29] for s,rows in args[0].items()}
  with self.assertRaises(ValueError):select_basket(daily,31*DAY)

class FundingChecks(ReplayChecks):
 def test_one_infeasible_leg_rejects_whole_basket(self):
  args=self.inputs();args[3]['BTCUSDT']['MIN_NOTIONAL']['notional']='10000'
  r=replay(*args)
  self.assertEqual(r['final'],100)
  self.assertFalse(r['events'])
 def test_funding_sign_and_missing_settlement(self):
  args=list(self.inputs());args[-1]=args[-2]+DAY
  for s in SYMBOLS:
   args[1][s]={t:[t,100,101,99,100] for t in range(args[-2],args[-1]+HOUR,HOUR)}
   args[2][s]={t:(.001 if s=='BTCUSDT' else 0,100) for t in range(args[-2],args[-1]+HOUR,HOUR) if t%(8*HOUR)==0}
  r=replay(*args)
  self.assertLess(r['funding'],0)
  self.assertAlmostEqual(r['final'],100+r['funding']-r['costs'])
  args[2]['BTCUSDT']={}
  with self.assertRaises(ValueError):replay(*args)

class CapitalChecks(ReplayChecks):
 def test_larger_paper_capital_admits_btc_without_leverage(self):
  args=self.inputs();args[3]['BTCUSDT']['MIN_NOTIONAL']['notional']='50'
  small=replay(*args,liquidate_at_end=False)
  large=replay(*args,liquidate_at_end=False,initial_capital=1000)
  self.assertEqual(small['final'],100)
  self.assertEqual(len(large['curve'][-1]['positions']),4)
  self.assertLess(large['final'],1000)
  self.assertAlmostEqual(large['net'],large['final']-1000)
  self.assertLessEqual(sum(abs(q)*100 for q in large['curve'][0]['positions'].values()),1000)
