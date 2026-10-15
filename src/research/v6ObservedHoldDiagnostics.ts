import { deduplicateClosedPositions, type ClosedPosition } from './v6CostStress.js';

export function observedHoldingMinutes(position: ClosedPosition): number | null {
  if (!position.openedAt) return null;
  const start = Date.parse(position.openedAt), end = Date.parse(position.closedAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : null;
}

export function observedHoldDiagnostics(positions: readonly ClosedPosition[]) {
  const closed = deduplicateClosedPositions(positions);
  const minutes = closed.map(observedHoldingMinutes);
  const valid = minutes.filter((x): x is number => x !== null).sort((a,b)=>a-b);
  return {
    closedCount: closed.length,
    durationCovered: valid.length,
    missingDuration: closed.length - valid.length,
    under4h: valid.filter(x => x < 240).length,
    from4to48h: valid.filter(x => x >= 240 && x < 2880).length,
    over48h: valid.filter(x => x >= 2880).length,
    medianMinutes: valid.length ? valid[Math.floor((valid.length-1)/2)] : null,
  };
}
