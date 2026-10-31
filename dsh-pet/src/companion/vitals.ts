/** Local idle simulation. No network calls; elapsed time is split at local hour boundaries. */
export interface Vitals {
  satiety: number;
  energy: number;
  mood: number;
  affection: number;
  miss: number;
  lastTickAt: number;
}
const clamp = (n: number): number => Math.max(0, Math.min(100, n));
/** Initial state for a newly created companion. */
export function initialVitals(now: number): Vitals {
  return { satiety: 80, energy: 80, mood: 60, affection: 50, miss: 0, lastTickAt: now };
}
/** Settle at most 24 hours, preserving the high-water timestamp on clock rollback. */
export function settle(v: Vitals, now: number): Vitals {
  if (!Number.isFinite(now) || now <= v.lastTickAt) return { ...v };
  const elapsed = (now - v.lastTickAt) / 3600000;
  let cursor = Math.max(v.lastTickAt, now - 86400000);
  let energy = v.energy;
  while (cursor < now) {
    const date = new Date(cursor);
    const next = new Date(cursor);
    next.setMinutes(60, 0, 0);
    const end = Math.min(now, next.getTime());
    const hours = (end - cursor) / 3600000;
    energy = clamp(energy + (date.getHours() >= 22 || date.getHours() < 8 ? 8 : -2) * hours);
    cursor = end;
  }
  const hours = Math.min(elapsed, 24);
  const satiety = clamp(v.satiety - 4 * hours);
  const baseline = 60 + (v.affection - 50) * 0.3 - (satiety < 30 ? 25 : 0);
  return {
    ...v,
    satiety,
    energy,
    mood: clamp(v.mood + (baseline - v.mood) * Math.min(1, hours / 3)),
    miss: clamp(v.miss + 2 * Math.min(elapsed, 72)),
    lastTickAt: now,
  };
}
