import effects from "../config/effects.json";
import { DAYPARTS } from "./forecast";
import { weekdayOf } from "./time";
import type { Correction, DayPart, Observation, Pin, Weekday } from "./types";

const PART_OF: Record<number, DayPart> = {};
for (const [part, hours] of Object.entries(DAYPARTS) as [DayPart, number[]][]) for (const h of hours) PART_OF[h] = part;
export const partOf = (h: number): DayPart | undefined => PART_OF[h];

/**
 * How this place really runs against Google's usual curve, from live readings: live / usual, in hours
 * no notable signal touched (a match night says nothing about a usual evening). Averaged in log space
 * per part of the day and shrunk towards "no change" when readings are few; per weekday, shrunk towards
 * the part-of-day figure. Google's usual comes from the reading itself, so the correction never feeds
 * on our own earlier corrections.
 */
export function usualCorrection(
  obs: Observation[],
  pinsByDate: Record<string, Pin[]>,
  weekday: Weekday,
): Partial<Record<DayPart, Correction>> {
  const c = effects.correction;
  const part: Partial<Record<DayPart, number[]>> = {};
  const day: Partial<Record<DayPart, number[]>> = {};
  for (const o of obs) {
    if (o.live === null || o.usual === null || o.usual < c.min_usual) continue;
    const p = partOf(o.hour);
    if (!p) continue;
    const pins = pinsByDate[o.date] ?? [];
    const touched = pins.some((x) => Math.abs(x.effect) >= c.ignore_pin_effect && o.hour + 1 > x.startHour && o.hour < x.endHour);
    if (touched) continue;
    const r = Math.log((o.live + 5) / (o.usual + 5));
    (part[p] ??= []).push(r);
    if (weekdayOf(o.date) === weekday) (day[p] ??= []).push(r);
  }
  const out: Partial<Record<DayPart, Correction>> = {};
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  for (const p of Object.keys(part) as DayPart[]) {
    const all = part[p]!;
    if (all.length < c.min_readings) continue;
    const base = mean(all) * (all.length / (all.length + c.shrink_part));
    const mine = day[p] ?? [];
    const k = mine.length ? base + (mean(mine) - base) * (mine.length / (mine.length + c.shrink_weekday)) : base;
    const factor = Math.min(c.max, Math.max(c.min, Math.exp(k)));
    if (Math.abs(factor - 1) >= 0.02) out[p] = { factor: Math.round(factor * 1000) / 1000, n: all.length };
  }
  return out;
}

/** The usual curve with each part of the day scaled by its correction. */
export function correctedCurve(curve: (number | null)[], corr: Partial<Record<DayPart, Correction>> | undefined): (number | null)[] {
  if (!corr || !Object.keys(corr).length) return curve;
  return curve.map((v, h) => {
    const p = partOf(h);
    return v === null || !p || !corr[p] ? v : Math.round(v * corr[p]!.factor * 10) / 10;
  });
}
