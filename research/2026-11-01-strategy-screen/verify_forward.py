"""Accounting checks for intermediate reports with open positions."""
import numpy as np
import screen

base=1793491200
t=np.arange(base,base+180*60,60,dtype=float)
bars=np.column_stack([t,np.full((len(t),4),100.)])
data={s:bars.copy() for s in screen.SYMBOLS}
hours={s:np.array([[base,100.,100.,100.,100.]]) for s in screen.SYMBOLS}
atrs={s:np.array([1.]) for s in screen.SYMBOLS}
key='portfolio_trend_4h'
signals={s:{key:{}} for s in screen.SYMBOLS};signals['ETHUSDT'][key][base+3600]=(1,1.,None)
open_report,open_trades,_,_=screen.simulate(data,hours,signals,atrs,key,'baseline',liquidate_at_end=False)
closed_report,closed_trades,_,_=screen.simulate(data,hours,signals,atrs,key,'baseline',liquidate_at_end=True)
assert len(open_trades)==0 and len(open_report['open_positions'])==1
assert open_report['closed_realized_net']==0 and open_report['open_entry_fees']>0
assert open_report['cash']<100 and open_report['equity']<open_report['cash']
assert len(closed_trades)==1 and closed_trades[0]['reason']=='END_OF_STUDY'
assert abs(open_report['equity']-closed_report['final'])<1e-9
print('PASS: open paper positions remain open; entry fees reconcile; marked equity matches modeled liquidation without inventing a closed trade.')
