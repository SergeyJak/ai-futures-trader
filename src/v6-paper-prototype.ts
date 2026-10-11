/** Research-only long dip-reversal paper prototype. No exchange orders. */
export type PaperCandle={time:number;close:number};
export type DipParams={lookback:number;threshold:number;stopLoss:number;takeProfit:number;maxBars:number;feeRate:number;slippageRate:number};
export type PaperTrade={entryTime:number;exitTime:number;grossReturn:number;netReturn:number;reason:'stop'|'target'|'time'};
export function simulateDipReversal(candles:PaperCandle[],p:DipParams):{trades:PaperTrade[];readyToTrade:false}{
 if(!Number.isInteger(p.lookback)||p.lookback<2||!Number.isInteger(p.maxBars)||p.maxBars<1||[p.threshold,p.stopLoss,p.takeProfit,p.feeRate,p.slippageRate].some(v=>!Number.isFinite(v)||v<0)||p.stopLoss===0||p.takeProfit===0)throw Error('Invalid paper strategy parameters');
 const trades:PaperTrade[]=[];
 for(let i=p.lookback;i<candles.length-1;){
  const entry=candles[i],previous=candles[i-1],reference=candles[i-p.lookback];
  if(![entry.close,previous.close,reference.close].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid candle');
  // Dip over lookback, then first rising completed candle. Enter only NEXT bar close,
  // conservatively avoiding entry on the signal bar itself.
  if(previous.close/reference.close-1>-p.threshold||entry.close<=previous.close){i++;continue}
  const fill=candles[i+1];if(!fill||!Number.isFinite(fill.close)||fill.close<=0)throw Error('Invalid entry');
  const entryPrice=fill.close*(1+p.slippageRate);
  let exitIndex=Math.min(i+1+p.maxBars,candles.length-1),reason:PaperTrade['reason']='time';
  for(let j=i+2;j<=exitIndex;j++){
   const mark=candles[j].close;
   if(!Number.isFinite(mark)||mark<=0)throw Error('Invalid exit');
   if(mark/entryPrice-1<=-p.stopLoss){exitIndex=j;reason='stop';break}
   if(mark/entryPrice-1>=p.takeProfit){exitIndex=j;reason='target';break}
  }
  const exit=candles[exitIndex];const grossReturn=exit.close/entryPrice-1;
  const netReturn=exit.close*(1-p.slippageRate)/entryPrice-1-p.feeRate*(1+exit.close*(1-p.slippageRate)/entryPrice);
  trades.push({entryTime:fill.time,exitTime:exit.time,grossReturn,netReturn,reason});
  i=exitIndex+1;
 }
 return {trades,readyToTrade:false};
}
