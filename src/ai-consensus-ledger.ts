/** Independent, forward-only decision ledger. Pure logic; no execution side effects. */
import type {ConsensusDecision,SignalSnapshot} from './ai-consensus-filter.js';
export interface PaperSignalObservation {
  id:string; snapshot:SignalSnapshot; decision:ConsensusDecision;
  observedAtMs:number;
}
export interface ForwardOutcome {
  signalId:string; closedAtMs:number; grossPnl:number;
  fees:number; slippage:number; funding:number;
}
export interface CohortSummary {
  signals:number; allowed:number; skipped:number; closed:number;
  netPnl:number; wins:number; losses:number;
}
export function summarizeForwardCohort(
 observations:readonly PaperSignalObservation[],
 outcomes:readonly ForwardOutcome[],
):CohortSummary {
 const ids=new Set<string>();
 const byId=new Map<string,PaperSignalObservation>();
 for(const row of observations){
  if(ids.has(row.id))throw new Error('duplicate-signal');
  ids.add(row.id);
  // A forward-only result cannot be based on a signal or observation from the future.
  if(!Number.isFinite(row.snapshot.signalTimeMs) || row.snapshot.signalTimeMs<=0 ||
     !Number.isFinite(row.snapshot.latestCandleCloseMs) ||
     !Number.isFinite(row.observedAtMs) ||
     row.observedAtMs<row.snapshot.signalTimeMs ||
     row.snapshot.latestCandleCloseMs>row.snapshot.signalTimeMs ||
     row.decision.signalTimeMs!==row.snapshot.signalTimeMs)
    throw new Error('non-forward-observation');
  byId.set(row.id,row);
 }
 let closed=0,netPnl=0,wins=0,losses=0;
 const outcomeIds=new Set<string>();
 for(const o of outcomes){
  if(outcomeIds.has(o.signalId))throw new Error('duplicate-outcome');
  outcomeIds.add(o.signalId);
  const signal=byId.get(o.signalId);
  if(!signal || signal.decision.decision!=='allow')throw new Error('unknown-or-skipped-outcome');
  // A fill cannot close before the signal was actually observed.
  if(!Number.isFinite(o.closedAtMs) || o.closedAtMs<signal.observedAtMs)
   throw new Error('outcome-before-observation');
  if(![o.grossPnl,o.fees,o.slippage,o.funding].every(Number.isFinite) ||
    o.fees<0 || o.slippage<0)throw new Error('invalid-cost');
  const net=o.grossPnl-o.fees-o.slippage-o.funding;
  netPnl+=net;closed++;if(net>0)wins++;else if(net<0)losses++;
 }
 return {signals:observations.length,allowed:observations.filter(o=>o.decision.decision==='allow').length,
 skipped:observations.filter(o=>o.decision.decision==='skip').length,closed,netPnl,wins,losses};
}
