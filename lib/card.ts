import { db } from "./db";
import { buildCard, loadPlace } from "./build";
import { localDate } from "./time";
import { weekdayOf } from "./time";
import type { Copy, Forecast, Place, Pin } from "./types";

export interface StoredCard {
  place: Place;
  forecast: Forecast;
  copy: Copy;
  warnings: string[];
}

/** Read today's stored card for tomorrow; build it on first view (e.g. right after onboarding). */
export async function getCard(place_id: string, date?: string, loaded?: Place): Promise<StoredCard | null> {
  const place = loaded ?? (await loadPlace(place_id));
  if (!place) return null;
  const target = date ?? localDate(place.timezone, 1);

  // The stored card and the tap count in one go (the tap count moves during the day; the card does not).
  const [{ data }, { count }] = await Promise.all([
    db().from("forecasts").select("*").eq("place_id", place_id).eq("date", target).maybeSingle(),
    db().from("taps").select("*", { count: "exact", head: true }).eq("place_id", place_id),
  ]);

  if (data) {
    const taps = count ?? (data.buckets as any).taps;
    const h = data.hourly as any;
    const b = data.buckets as any;
    const forecast: Forecast = {
      date: target,
      weekday: weekdayOf(target),
      baseline: h.baseline,
      hourly: h.hourly,
      lo: h.lo,
      hi: h.hi,
      buckets: b.buckets,
      ratios: b.ratios,
      pins: data.pins as Pin[],
      band: Number(data.band),
      taps,
      tuned: taps >= 7,
      baselineSource: b.baselineSource,
      ...(b.correction ? { correction: b.correction } : {}),
    };
    return { place, forecast, copy: data.copy as Copy, warnings: [] };
  }

  const card = await buildCard(place, target);
  return { place, forecast: card.forecast, copy: card.copy, warnings: card.warnings };
}
