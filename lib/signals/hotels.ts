import { serp } from "../serp";
import { cached } from "../cache";
import { addDays } from "../time";
import effects from "../../config/effects.json";
import type { Place, Signal } from "../types";

export interface HotelsPayload {
  /** Median of per-hotel price ratios, tomorrow night / the same weekday two weeks later. */
  ratio: number | null;
  matched: number;
  target: string;
  reference: string;
}

/** name -> lowest nightly rate. Real shape: fixtures/google-hotels-hotels-in-Bengaluru-*.json */
export function hotelPrices(res: any): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of res?.properties ?? []) {
    const v = p?.rate_per_night?.extracted_lowest;
    if (p?.name && typeof v === "number" && v > 0) out.set(String(p.name), v);
  }
  return out;
}

/** Hotel by hotel, so a list that happens to show more luxury hotels one night doesn't read as a jump. */
export function priceRatio(target: Map<string, number>, reference: Map<string, number>): { ratio: number | null; matched: number } {
  const r: number[] = [];
  for (const [name, v] of target) {
    const ref = reference.get(name);
    if (ref) r.push(v / ref);
  }
  if (!r.length) return { ratio: null, matched: 0 };
  r.sort((a, b) => a - b);
  const mid = r.length >> 1;
  return { ratio: r.length % 2 ? r[mid] : (r[mid - 1] + r[mid]) / 2, matched: r.length };
}

/** Two Google Hotels searches per city per day (engine=google_hotels). Tomorrow only, to save credits. */
export async function fetchHotels(place: Place, fetchDate: string, targetDate: string): Promise<HotelsPayload> {
  return cached(place.city, fetchDate, `hotels:${targetDate}`, 24, async () => {
    const reference = addDays(targetDate, 14);
    const one = (d: string) =>
      serp({
        engine: "google_hotels",
        q: `hotels in ${place.city}`,
        check_in_date: d,
        check_out_date: addDays(d, 1),
        currency: place.country?.toLowerCase() === "india" ? "INR" : "USD",
        gl: place.country?.toLowerCase() === "india" ? "in" : undefined,
        hl: "en",
      });
    const [a, b] = await Promise.all([one(targetDate), one(reference)]);
    return { ...priceRatio(hotelPrices(a), hotelPrices(b)), target: targetDate, reference };
  });
}

export function hotelSignals(place: Place, p: HotelsPayload, targetDate: string): Signal[] {
  const c = effects.hotels;
  if (p.target !== targetDate || p.ratio === null || p.matched < c.min_matched) return [];
  const rise = p.ratio - 1;
  if (rise < c.min_rise) return [];
  const strength = Math.min(1, (rise - c.min_rise) / (c.full_rise - c.min_rise) + 0.25);
  const base = (c.effect as Record<string, number>)[place.archetype] ?? 0;
  if (!base) return [];
  return [
    {
      kind: "hotels",
      label: `Hotel prices up ${Math.round(rise * 100)}% tomorrow night`,
      source: "Google Hotels",
      detail: `${p.matched} ${place.city} hotels, tomorrow against the same night two weeks later. Visitors are arriving, often before any event listing shows it.`,
      distanceKm: null,
      startHour: c.hours[0],
      endHour: c.hours[1],
      size: 1,
      effectOverride: base * strength,
    },
  ];
}
