/** Pure, forward-only decision layer. No orders, DB writes, or external AI calls. */
export type SignalSide='LONG'|'SHORT';
export interface SignalSnapshot {
  strategy:string; symbol:string; side:SignalSide;
  signalTimeMs:number; latestCandleCloseMs:number;
  confidence:number; volatilityPct:number; spreadPct:number;
}
export interface ConsensusDecision {
  decision:'allow'|'skip'; reason:string; confidence:number;
  modelVersion:'rules-baseline-v1'; signalTimeMs:number;
}
export function evaluateConsensus(snapshot:Readonly<SignalSnapshot>):ConsensusDecision {
  const base={modelVersion:'rules-baseline-v1' as const,signalTimeMs:snapshot.signalTimeMs};
  if(!Number.isFinite(snapshot.signalTimeMs)||snapshot.signalTimeMs<=0||
     !Number.isFinite(snapshot.latestCandleCloseMs)||snapshot.latestCandleCloseMs>snapshot.signalTimeMs)
    return {...base,decision:'skip',reason:'invalid-or-future-market-data',confidence:0};
  if(!snapshot.strategy.trim()||!snapshot.symbol.trim()||
     ![snapshot.confidence,snapshot.volatilityPct,snapshot.spreadPct].every(Number.isFinite)||
     snapshot.confidence<0||snapshot.confidence>1||snapshot.volatilityPct<0||snapshot.spreadPct<0)
    return {...base,decision:'skip',reason:'invalid-input',confidence:0};
  if(snapshot.spreadPct>0.15)return {...base,decision:'skip',reason:'spread-too-wide',confidence:snapshot.confidence};
  if(snapshot.volatilityPct>5)return {...base,decision:'skip',reason:'volatility-too-high',confidence:snapshot.confidence};
  if(snapshot.confidence<0.65)return {...base,decision:'skip',reason:'confidence-below-threshold',confidence:snapshot.confidence};
  return {...base,decision:'allow',reason:'baseline-conditions-met',confidence:snapshot.confidence};
}
export function evaluateExperimentalConsensus(snapshot:Readonly<SignalSnapshot>,enabled:boolean):ConsensusDecision|null {
  return enabled?evaluateConsensus(snapshot):null;
}
