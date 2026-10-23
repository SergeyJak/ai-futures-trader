/** Presentation-ready comparison of independent paper cohorts; no order execution. */
import {summarizeForwardCohort,type PaperSignalObservation,type ForwardOutcome} from './ai-consensus-ledger.js';
export interface PaperCohort {observations:readonly PaperSignalObservation[]; outcomes:readonly ForwardOutcome[]}
export function comparePaperCohorts(control:PaperCohort,filtered:PaperCohort){
 const a=summarizeForwardCohort(control.observations,control.outcomes);
 const b=summarizeForwardCohort(filtered.observations,filtered.outcomes);
 return {
  mode:'PAPER_RESEARCH_ONLY' as const,
  control:a,filtered:b,
  netPnlDelta:b.netPnl-a.netPnl,
  tradeCountDelta:b.closed-a.closed,
  sampleWarning:a.closed<30||b.closed<30?'insufficient-closed-trades':null,
 };
}
