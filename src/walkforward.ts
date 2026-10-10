import {backtest, type Bar, type Strategy} from './backtest.js';
export function validateHistory(rows:Bar[]){
 let gaps=0;
 for(let i=1;i<rows.length;i++){
  const previous=Date.parse(rows[i-1].start_at),current=Date.parse(rows[i].start_at);
  if(!Number.isFinite(previous)||!Number.isFinite(current)||current<=previous)throw Error('Invalid candle order');
  gaps+=Math.max(0,Math.round((current-previous)/60000)-1);
 }
 return {gaps,complete:gaps===0,minutes:rows.length};
}
export function walkForward(rows:Bar[],strategy:Strategy){
 const quality=validateHistory(rows);
 const split=Math.floor(rows.length*.7);
 const training=rows.slice(0,split);
 // Validation starts strictly after training; warm-up occurs inside validation.
 const testing=rows.slice(split);
 const train=backtest(training,1000,strategy);
 const test=backtest(testing,1000,strategy);
 return {strategy,quality,splitAt:rows[split]?.start_at??null,training:{bars:training.length,returnPct:train.returnPct,trades:train.trades,maxDrawdown:train.maxDrawdown},validation:{bars:rows.length-split,returnPct:test.returnPct,trades:test.trades,maxDrawdown:test.maxDrawdown},preliminary:rows.length<2880||quality.gaps>0};
}
