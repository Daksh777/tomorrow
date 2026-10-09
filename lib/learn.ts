import { db } from "./db";
import { dropUpcoming } from "./invalidate";
import { scoreDay, updateWeights, type Weights } from "./forecast";
import { observationsFor } from "./observe";
import type { Place } from "./types";

/** Live readings move weights only when there are enough of them and the miss is clear of noise. */
const MIN_READINGS = 2;

export type TapResult =
  | { ok: true; alreadyTapped: true }
  | { ok: true; changed: Record<string, { from: number; to: number }>; learnedFrom: "tap" | "live"; score?: ReturnType<typeof scoreDay> }
  | { ok: false; error: string; status: number };

/**
 * The morning tap: quieter -1, as expected 0, busier +1. One tap per place per day: a second tap for
 * the same day is ignored (it would train the same pins twice).
 *
 * What it learns from: if Google's live readings scored that day, their measured miss (live / forecast - 1,
 * scaled so a 50% miss counts as a full tap) when it agrees in direction with the owner's tap or the
 * owner said "as expected"; the owner's tap otherwise. The owner is on the floor, so a disagreement goes
 * their way.
 */
export async function applyTap(place: Pick<Place, "place_id" | "timezone">, date: string, value: -1 | 0 | 1, daypart?: string | null): Promise<TapResult> {
  const { place_id } = place;
  const sb = db();
  const { data: existing } = await sb.from("taps").select("value").eq("place_id", place_id).eq("date", date).maybeSingle();
  if (existing) return { ok: true, alreadyTapped: true };

  const { data: fc } = await sb.from("forecasts").select("pins, hourly").eq("place_id", place_id).eq("date", date).maybeSingle();
  if (!fc) return { ok: false, error: "no forecast was made for that day", status: 404 };

  const { data: rows } = await sb.from("weights").select("signal_kind, w").eq("place_id", place_id);
  const before: Weights = {};
  for (const r of rows ?? []) before[r.signal_kind as keyof Weights] = r.w;

  const h = fc.hourly as any;
  const score = scoreDay({ hourly: h.hourly, lo: h.lo, hi: h.hi }, await observationsFor(place_id, date, date));
  let outcome: number = value;
  let from: "tap" | "live" = "tap";
  if (score && score.n >= MIN_READINGS) {
    const measured = Math.max(-1, Math.min(1, score.meanMiss / 0.5));
    if (value === 0 || Math.sign(measured) === value) {
      outcome = value === 0 ? (Math.abs(measured) > 0.2 ? measured * 0.5 : 0) : measured;
      from = "live";
    }
  }

  const active = (fc.pins as { kind: any; effect: number }[]).map((p) => ({ kind: p.kind, effect: p.effect }));
  const after = updateWeights(before, active, outcome);

  await sb.from("taps").insert({ place_id, date, value, daypart: daypart ?? null });
  const up = Object.entries(after).map(([signal_kind, w]) => ({ place_id, signal_kind, w }));
  if (up.length) await sb.from("weights").upsert(up);
  await dropUpcoming(place); // tomorrow's card and the week use the new weights

  const changed = Object.fromEntries(
    Object.keys(after)
      .filter((k) => after[k as keyof Weights] !== (before[k as keyof Weights] ?? 1))
      .map((k) => [k, { from: before[k as keyof Weights] ?? 1, to: after[k as keyof Weights]! }]),
  );
  return { ok: true, changed, learnedFrom: from, ...(score ? { score } : {}) };
}
