import effects from "../../config/effects.json";
import { addDays } from "../time";
import type { Observation, Signal } from "../types";

/**
 * Review velocity from our own review-count snapshots (taken with each live reading).
 * Reviews per day over the last `recent_days` against the `prior_days` before; null until there is
 * a snapshot at both ends of each window.
 */
export function reviewVelocity(obs: Observation[], today: string): { recent: number; prior: number } | null {
  const c = effects.trend;
  const snaps = obs.filter((o) => typeof o.reviews === "number").map((o) => ({ date: o.date, n: o.reviews as number }));
  if (snaps.length < 3) return null;
  const at = (date: string) => {
    // The latest snapshot on or before the date.
    let best: { date: string; n: number } | null = null;
    for (const s of snaps) if (s.date <= date && (!best || s.date >= best.date)) best = s;
    return best;
  };
  const now = at(today);
  const mid = at(addDays(today, -c.recent_days));
  const start = at(addDays(today, -(c.recent_days + c.prior_days)));
  if (!now || !mid || !start || mid.date === start.date || now.date === mid.date) return null;
  const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;
  // Need the windows actually covered (a snapshot within a week of each boundary).
  if (days(start.date, addDays(today, -(c.recent_days + c.prior_days))) > 7) return null;
  return { recent: (now.n - mid.n) / days(mid.date, now.date), prior: (mid.n - start.n) / days(start.date, mid.date) };
}

export function trendSignals(obs: Observation[], today: string): Signal[] {
  const c = effects.trend;
  const v = reviewVelocity(obs, today);
  if (!v || v.prior <= 0 || v.recent < 0) return [];
  const ratio = v.recent / v.prior;
  const effect = Math.max(c.min, Math.min(c.max, Math.log2(Math.max(ratio, 0.01)) * c.per_doubling));
  if (Math.abs(effect) < 0.015) return [];
  const faster = ratio >= 1;
  return [
    {
      kind: "trend",
      label: faster ? `Reviews coming in ${ratio.toFixed(1)}x faster than last month` : `Reviews slowing (${ratio.toFixed(1)}x last month)`,
      source: "Google Maps reviews",
      detail: `${v.recent.toFixed(1)} new reviews a day over the last ${c.recent_days} days, against ${v.prior.toFixed(1)} before. More reviews usually means more new customers finding you.`,
      distanceKm: null,
      startHour: 0,
      endHour: 24,
      size: 1,
      effectOverride: effect,
    },
  ];
}
