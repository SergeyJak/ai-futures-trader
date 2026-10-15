import type { ClosedPosition } from './v6CostStress.js';

export function observedHoldingMinutes(position: ClosedPosition): number | null {
  if (!position.openedAt) return null;
  const start = Date.parse(position.openedAt), end = Date.parse(position.closedAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : null;
}
