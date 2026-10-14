import type {v6Insights} from './v6-insights.js';
/** Cohorts based exclusively on deduplicated, fully closed positions from v6Insights. */
export function summarizeV6HoldingCohorts(insights:ReturnType<typeof v6Insights>){
 const styles=['intraday','swing','multiday','insufficient'] as const;
 const cohorts=styles.map(style=>{
  const traders=insights.traders.filter(t=>{
   if(t.records<5||t.medianHoldMinutes===null)return style==='insufficient';
   return (t.medianHoldMinutes<240?'intraday':t.medianHoldMinutes<2880?'swing':'multiday')===style;
  });
  const closedPositions=traders.reduce((n,t)=>n+t.records,0);
  const pnlCovered=traders.reduce((n,t)=>n+t.withPnl,0);
  const costCovered=traders.reduce((n,t)=>n+t.costCoverage,0);
  const grossPnl=traders.reduce((n,t)=>n+t.reportedPnl,0);
  const estimatedFees=traders.reduce((n,t)=>n+t.estimatedRoundTripFees,0);
  return {style,traders:traders.length,closedPositions,pnlCovered,costCovered,
   grossReportedPnl:pnlCovered===closedPositions?grossPnl:null,
   estimatedFees:costCovered===closedPositions?estimatedFees:null,
   estimatedNetBeforeSlippageAndFunding:pnlCovered===closedPositions&&costCovered===closedPositions?grossPnl-estimatedFees:null,
   incompleteCosts:costCovered!==closedPositions,
   traderIds:traders.map(t=>t.trader),
  };
 });
 return {basis:'deduplicated fully closed historical positions only',thresholdsHours:{intradayUnder:4,swingUnder:48},minimumClosedPerTrader:5,cohorts,
  warning:'Provider-reported PnL may already include fees; estimated fee subtraction can double-count. Slippage, funding, capital weighting and chronological OOS are unverified. Descriptive cohorts only; not a trading signal.'};
}
