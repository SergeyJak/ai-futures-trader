import type {FilterScore} from './entry-filter-oos.js';
/** Conservative research gate. No automatic promotion or order execution. */
export type ResearchDecision={name:string;decision:'candidate-for-paper'|'insufficient-data'|'reject'|'baseline';reason:string;trainTrades:number;testTrades:number;testNet:number;testMean:number;netVsBaseline:number};
export function summarizeOos(scores:FilterScore[]):ResearchDecision[]{
 return scores.map(s=>{
  let decision:ResearchDecision['decision']='reject',reason='No positive train-only evidence';
  if(s.name==='baseline'){decision='baseline';reason='Reference, never promoted'}
  else if(!s.selectedOnTrain){reason='Not selected by training data'}
  else if(!s.eligible){decision='insufficient-data';reason='Insufficient held-out trades'}
  else if(s.testNet<=0||s.testMean<=0||s.netVsBaseline<=0){reason='Held-out result does not beat positive-net baseline'}
  else {decision='candidate-for-paper';reason='Positive held-out net and above equal-count baseline; manual review required'}
  return {name:s.name,decision,reason,trainTrades:s.trainTrades,testTrades:s.testTrades,testNet:s.testNet,testMean:s.testMean,netVsBaseline:s.netVsBaseline};
 });
}
