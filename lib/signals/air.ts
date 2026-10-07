import { cached } from "../cache";
import effects from "../../config/effects.json";
import type { Place, Signal } from "../types";

export interface AirPayload {
  source: "Open-Meteo air quality";
  /** date -> hour(0..23) -> PM2.5 in ug/m3 */
  days: Record<string, Record<string, number>>;
}

/** Free, no key. Hourly PM2.5 for 5 days in the place's timezone. */
export async function fetchAir(place: Place, fetchDate: string): Promise<AirPayload> {
  return cached(place.city, fetchDate, "air", 6, async () => {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lng}` +
      `&hourly=pm2_5&forecast_days=5&timezone=${encodeURIComponent(place.timezone)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo air quality ${r.status}`);
    const j: any = await r.json();
    const days: AirPayload["days"] = {};
    (j.hourly.time as string[]).forEach((t, i) => {
      const [date, hhmm] = t.split("T");
      const v = j.hourly.pm2_5[i];
      if (v !== null && v !== undefined) (days[date] ??= {})[String(Number(hhmm.slice(0, 2)))] = v;
    });
    return { source: "Open-Meteo air quality" as const, days };
  });
}

/** CPCB category for a daytime mean PM2.5, or null when the air is fine. */
export function aqiCategory(pm25: number): { name: string; effect: number } | null {
  const c = effects.aqi;
  if (pm25 >= c.severe.min) return { name: "severe", effect: c.severe.effect };
  if (pm25 >= c.very_poor.min) return { name: "very poor", effect: c.very_poor.effect };
  if (pm25 >= c.poor.min) return { name: "poor", effect: c.poor.effect };
  return null;
}

export function airSignals(place: Place, payload: AirPayload, targetDate: string): Signal[] {
  const hours = payload.days[targetDate];
  if (!hours) return [];
  const day = Object.entries(hours).filter(([h]) => Number(h) >= 8 && Number(h) <= 22).map(([, v]) => v);
  if (day.length < 6) return [];
  const mean = day.reduce((a, b) => a + b, 0) / day.length;
  const cat = aqiCategory(mean);
  if (!cat) return [];
  const f = (effects.aqi.archetype_factor as Record<string, number>)[place.archetype] ?? 1;
  const effect = cat.effect * f;
  if (!effect) return [];
  return [
    {
      kind: "aqi",
      label: `Air quality ${cat.name} (PM2.5 ${Math.round(mean)})`,
      source: payload.source,
      detail: "Delhi footfall studies show people avoid open streets and head to malls when the air is bad.",
      distanceKm: null,
      startHour: 8,
      endHour: 22,
      size: 1,
      effectOverride: effect,
    },
  ];
}
