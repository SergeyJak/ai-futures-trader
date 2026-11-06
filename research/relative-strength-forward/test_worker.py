import unittest
from worker import candle_rows, funding_rows, make_checkpoint, packet_bytes
from engine import HOUR, DAY, SYMBOLS
from replay import START

class WorkerChecks(unittest.TestCase):
 def test_candles_page_and_replace_incomplete_boundary(self):
  calls=[]
  def get(path,params):
   calls.append(params['startTime']);return [[t,100,101,99,100,1,t+HOUR-1,1e8] for t in range(params['startTime'],min(params['endTime']+1,params['startTime']+2*HOUR),HOUR)]
  old=[[START,100,100,100,100,1,START+HOUR-1,1e8]]
  rows=candle_rows(get,'SOLUSDT','1h',START,START+3*HOUR,old)
  self.assertEqual(len(rows),4);self.assertEqual(rows[0][2],101);self.assertEqual(calls,[START,START+2*HOUR])
 def test_snapshot_hash_ignores_jsonb_key_reordering(self):
  self.assertEqual(packet_bytes({'z':{'b':2,'a':1},'a':0}),packet_bytes({'a':0,'z':{'a':1,'b':2}}))
 def test_empty_candles_fail(self):
  with self.assertRaises(ValueError):candle_rows(lambda *a:[],'SOLUSDT','1h',START,START+HOUR,[])
 def test_out_of_order_or_gap_candles_fail(self):
  with self.assertRaises(ValueError):candle_rows(lambda *a:[[START+HOUR,1,1,1,1]],'SOLUSDT','1h',START,START+HOUR,[])
 def test_funding_pagination(self):
  data=[{'fundingTime':t,'fundingRate':'0','markPrice':'100'} for t in range(8*HOUR,32*HOUR,8*HOUR)]
  def get(path,p):return [x for x in data if p['startTime']<=x['fundingTime']<=p['endTime']][:2]
  self.assertEqual(funding_rows(get,'SOLUSDT',0,24*HOUR,[]),data)
 def test_future_end_rejected_without_network(self):
  with self.assertRaises(ValueError):make_checkpoint({},START+HOUR,now=START)
