/** Compact, read-only V6 research telemetry. Never emits raw trader IDs, positions or fills. */
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function compactV6Research(analysis:{counts:unknown;entryStudy:unknown;outOfSample:unknown},at:string){
 const entry=record(analysis.entryStudy),oos=record(analysis.outOfSample);
 return {
  at,
  observationCounts:analysis.counts,
  entrySample:entry.sample??null,
  entryPatterns:record(entry.patternStudy).patterns??null,
  eligibleEntryPatterns:record(entry.patternStudy).eligible??null,
  missingCandleCoverage:record(entry.coverage).reasons??null,
  oosClosedHistoryRows:oos.closedHistoryRows??null,
  oosEligibleRows:oos.eligibleWithCompleteCandlesAndPrices??null,
  oosExcludedRows:oos.excluded??null,
  oosAssessment:oos.assessment??null,
  errors:{entry:entry.error??null,oos:oos.error??null},
  note:'Observed closed trader history only; open snapshots excluded from OOS. Costs included in OOS; no claim of executable or profitable strategy.'
 };
}
