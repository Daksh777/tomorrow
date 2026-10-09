import effects from "../config/effects.json";
import { weekdayOf } from "./time";
import type {
  Archetype,
  DayPart,
  Forecast,
  Level,
  Pin,
  Signal,
  SignalKind,
  Weekday,
  Baseline,
} from "./types";

export type Weights = Partial<Record<SignalKind, number>>;

export const DAYPARTS: Record<DayPart, number[]> = {
  morning: [6, 7, 8, 9, 10],
  lunch: [11, 12, 13, 14],
  afternoon: [15, 16, 17],
  evening: [18, 19, 20, 21],
  late: [22, 23, 0, 1],
};

export function bucketOf(ratio: number): Level {
  const b = effects.buckets;
  if (ratio < b.quieter) return "quieter";
  if (ratio < b.usual) return "usual";
  if (ratio < b.busier) return "busier";
  return "much busier";
}

/** Base table effect for a signal at this archetype, before distance/size scaling. */
export function baseEffect(archetype: Archetype, s: Signal): number {
  if (s.effectOverride !== undefined) return s.effectOverride;
  const row = (effects.archetypes as Record<string, Record<string, number>>)[archetype];
  return row?.[s.kind] ?? 0;
}

/**
 * Linear falloff to zero at the owner's radius. `plateau` (0..1) keeps full effect out to that
 * fraction of the radius first; used for stadium matches, whose crowd walks a couple of km.
 */
export function distanceScale(distanceKm: number | null, radiusKm: number, plateau = 0): number {
  if (distanceKm === null) return 1;
  const near = radiusKm * plateau;
  if (distanceKm <= near) return 1;
  return Math.max(0, 1 - (distanceKm - near) / (radiusKm - near));
}

const STADIUM_PLATEAU = 0.75;
/** Readings needed before the measured band counts as much as the rule-based one. */
const CALIBRATION_PRIOR = 20;
/** Share of live readings the band should contain. */
export const BAND_TARGET = 0.8;

/** Fraction of clock-hour h (0..23, also h+24 for after-midnight) covered by [start, end). */
function overlap(h: number, start: number, end: number): number {
  const a = Math.max(h, start);
  const b = Math.min(h + 1, end);
  return Math.max(0, b - a);
}

/** Hours (0..24) during which both windows are active, counting after-midnight spill. */
export function sharedHours(a: Signal, b: Signal): number {
  let t = 0;
  for (let h = 0; h < 24; h++) t += Math.min(exposure(h, a), exposure(h, b));
  return t;
}

/** Exposure of hour-of-day h to a window that may run past midnight. */
function exposure(h: number, s: Signal): number {
  return Math.min(1, overlap(h, s.startHour, s.endHour) + overlap(h + 24, s.startHour, s.endHour) + overlap(h - 24, s.startHour, s.endHour));
}

export interface ForecastInput {
  date: string;
  baseline: Baseline;
  baselineSource: "own" | "peers";
  archetype: Archetype;
  radiusKm: number;
  signals: Signal[];
  weights: Weights;
  /** Days ahead of today (1 = tomorrow). Further days get a wider band. */
  horizonDays?: number;
  /** Band half-width measured from past forecasts against Google's live readings, and how many readings. */
  calibration?: { band: number; n: number } | null;
  /** Signal kinds whose weight the owner set by hand (not learned from taps). */
  ownerSet?: SignalKind[];
  taps: number;
}

/** F(h) = B(h) × Π (1 + w_i · e_i(h)); e_i(h) from the effect table, scaled by distance and size. */
export function forecast(input: ForecastInput): Forecast {
  const weekday: Weekday = weekdayOf(input.date);
  const B = input.baseline[weekday];

  const active = input.signals
    .map((s) => {
      const e = baseEffect(input.archetype, s) * distanceScale(s.distanceKm, input.radiusKm, s.kind === "match_stadium" ? STADIUM_PLATEAU : 0) * s.size;
      return { s, e };
    })
    .filter((x) => x.e !== 0);

  // Disagreement: pairs of signals with opposite signs that overlap in time (windows may run past midnight).
  let disagree = 0;
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i],
        b = active[j];
      if (Math.sign(a.e) !== Math.sign(b.e) && sharedHours(a.s, b.s) > 0) disagree++;
    }

  // Hand-set weights are the owner's judgement, not evidence: each active one that differs from the
  // default adds 0.04 of uncertainty, so "the owner turned everything up" shows as a wider band.
  const adjusted = new Set(active.map((x) => x.s.kind).filter((k) => input.ownerSet?.includes(k) && (input.weights[k] ?? 1) !== 1));
  // Days further out have fewer signals (news only covers tomorrow), so they get a wider band.
  const horizon = 0.03 * Math.max(0, (input.horizonDays ?? 1) - 1);
  const rule = Math.min(0.5, 0.06 + 0.06 * disagree + Math.max(0, 0.16 - 0.02 * input.taps) + 0.04 * adjusted.size + horizon);
  // Once Google's live readings have scored enough past forecasts, the measured width takes over.
  const cal = input.calibration;
  const trust = cal && cal.n > 0 ? cal.n / (cal.n + CALIBRATION_PRIOR) : 0;
  const band = Math.min(0.5, (1 - trust) * rule + trust * (cal ? cal.band + horizon : 0));

  const hourly: (number | null)[] = [];
  const lo: (number | null)[] = [];
  const hi: (number | null)[] = [];
  for (let h = 0; h < 24; h++) {
    const b = B[h];
    if (b === null || b === undefined) {
      hourly.push(null);
      lo.push(null);
      hi.push(null);
      continue;
    }
    let f = b;
    for (const { s, e } of active) {
      const w = input.weights[s.kind] ?? 1;
      f *= Math.max(0, 1 + w * e * exposure(h, s));
    }
    f = Math.min(b * effects.multiplier_cap.max, Math.max(b * effects.multiplier_cap.min, f));
    hourly.push(f);
    lo.push(Math.max(0, f * (1 - band)));
    hi.push(f * (1 + band)); // not capped at 100: a day busier than your usual peak must stay inside its band
  }

  const buckets: Forecast["buckets"] = {};
  const ratios: Forecast["ratios"] = {};
  for (const [part, hours] of Object.entries(DAYPARTS) as [DayPart, number[]][]) {
    let sb = 0,
      sf = 0;
    for (const h of hours) {
      if (B[h] === null || B[h] === undefined || hourly[h] === null) continue;
      sb += B[h] as number;
      sf += hourly[h] as number;
    }
    if (sb < 5) continue; // closed or dead part of the day
    const r = sf / sb - 1;
    ratios[part] = r;
    buckets[part] = bucketOf(r);
  }

  const pins: Pin[] = active.map(({ s, e }) => ({
    kind: s.kind,
    label: s.label,
    source: s.source,
    detail: s.detail,
    distanceKm: s.distanceKm,
    startHour: s.startHour,
    endHour: s.endHour,
    effect: e * (input.weights[s.kind] ?? 1), // as applied to the curve, so copy and pins match it
    ...(s.links?.length ? { links: s.links } : {}),
  }));

  return {
    date: input.date,
    weekday,
    baseline: B,
    hourly,
    lo,
    hi,
    buckets,
    ratios,
    pins,
    band,
    taps: input.taps,
    tuned: input.taps >= 7,
    baselineSource: input.baselineSource,
  };
}

/** The four plain-language choices an owner sees, and the weight each sets. */
export const OWNER_LEVELS = [
  { id: "none", label: "Not at all", w: 0 },
  { id: "less", label: "A bit", w: 0.5 },
  { id: "default", label: "Default", w: 1 },
  { id: "more", label: "A lot", w: 1.5 },
] as const;

/**
 * Learning from one day. `outcome` runs from -1 (much quieter than forecast) to +1 (much busier):
 * the morning tap, or the measured miss from Google's live readings when there are any.
 * Each signal's weight moves by 0.2 x outcome x sign(e), scaled by its share of the day's biggest
 * effect, so a small payday nudge is not blamed as much as the stadium match. Clamped to [0, 2].
 * "As expected" (0) leaves weights alone: the weights that produced a right forecast are kept,
 * and the tap still counts towards a narrower band.
 */
export function updateWeights(
  weights: Weights,
  active: { kind: SignalKind; effect: number }[],
  outcome: number,
): Weights {
  const next: Weights = { ...weights };
  const o = Math.max(-1, Math.min(1, outcome));
  // One entry per kind: the largest effect of that kind on the day.
  const byKind = new Map<SignalKind, number>();
  for (const a of active) if (Math.abs(a.effect) > Math.abs(byKind.get(a.kind) ?? 0)) byKind.set(a.kind, a.effect);
  const biggest = Math.max(0, ...[...byKind.values()].map(Math.abs));
  if (!biggest) return next;
  for (const [kind, effect] of byKind) {
    const share = Math.abs(effect) / biggest;
    const w = next[kind] ?? 1;
    next[kind] = Math.round(Math.min(2, Math.max(0, w + 0.2 * o * Math.sign(effect) * share)) * 1000) / 1000;
  }
  return next;
}

/** Ratio of tomorrow's total to a usual day's total, over the hours the place is open. */
export function dayRatio(f: Pick<Forecast, "hourly" | "baseline">): number {
  let b = 0,
    t = 0;
  for (let h = 0; h < 24; h++) {
    if (f.baseline[h] == null || f.hourly[h] == null) continue;
    b += f.baseline[h] as number;
    t += f.hourly[h] as number;
  }
  return b > 0 ? t / b : 1;
}

/**
 * Band half-width that would have held BAND_TARGET of past live readings: the 80th percentile
 * of |live / forecast - 1|. Hours with tiny forecasts are skipped (a 3 vs 6 reading is noise).
 */
export function calibrateBand(pairs: { live: number; forecast: number }[]): { band: number; n: number } | null {
  const errs = pairs.filter((p) => p.forecast >= 10).map((p) => Math.abs(p.live / p.forecast - 1)).sort((a, b) => a - b);
  if (!errs.length) return null;
  const i = Math.min(errs.length - 1, Math.ceil(BAND_TARGET * errs.length) - 1);
  return { band: Math.min(0.5, Math.max(0.04, errs[i])), n: errs.length };
}

/** How a day went against Google's live readings: share inside the band and the mean miss. */
export function scoreDay(
  f: Pick<Forecast, "hourly" | "lo" | "hi">,
  obs: { hour: number; live: number | null }[],
): { n: number; inside: number; meanMiss: number } | null {
  const rows = obs.filter((o) => o.live !== null && f.hourly[o.hour] != null && (f.hourly[o.hour] as number) >= 10);
  if (!rows.length) return null;
  let inside = 0,
    miss = 0;
  for (const o of rows) {
    const fh = f.hourly[o.hour] as number;
    if ((o.live as number) >= (f.lo[o.hour] ?? 0) && (o.live as number) <= (f.hi[o.hour] ?? Infinity)) inside++;
    miss += (o.live as number) / fh - 1;
  }
  return { n: rows.length, inside, meanMiss: miss / rows.length };
}
