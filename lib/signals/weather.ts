import { serp } from "../serp";
import { cached } from "../cache";
import { serpLocation } from "../location";
import { fmtHour } from "../time";
import type { Place, Signal } from "../types";

export interface WeatherPayload {
  source: "SerpApi answer box" | "Open-Meteo";
  /** date -> hour(0..23) -> { rain: 0..100 probability, mm } */
  days: Record<string, Record<string, { rain: number; mm: number }>>;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Real shape (see fixtures/google-weather-*): answer_box.hourly_forecast[] rows like
 * { time: "Wednesday 5:00 PM" (narrow no-break space before PM), precipitation: "15%" }, about
 * 250 rows over a week. answer_box.forecast[] is the 8-day daily list and has no hours.
 * Weekday names are mapped to the next occurrence on or after fetchDate.
 */
export function fromAnswerBox(res: any, fetchDate: string): WeatherPayload | null {
  const rows: any[] = res.answer_box?.hourly_forecast ?? [];
  if (!Array.isArray(rows) || rows.length < 12) return null;
  const base = new Date(`${fetchDate}T00:00:00Z`);
  const dateOf: Record<string, string> = {};
  for (let i = 0; i < 8; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    dateOf[WEEKDAYS[d.getUTCDay()]] ??= d.toISOString().slice(0, 10);
  }
  const days: WeatherPayload["days"] = {};
  for (const r of rows) {
    const m = /([A-Za-z]+)\s+(\d{1,2})(?::\d{2})?\s*(AM|PM)/i.exec(String(r.time ?? ""));
    const date = m && dateOf[m[1].toLowerCase()];
    if (!m || !date) continue;
    const h = (Number(m[2]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
    const p = parseInt(String(r.precipitation ?? "0"), 10);
    (days[date] ??= {})[String(h)] ??= { rain: isNaN(p) ? 0 : p, mm: 0 };
  }
  return Object.keys(days).length ? { source: "SerpApi answer box", days } : null;
}

/** Fallback: Open-Meteo (free, not SerpApi). Seven days, hourly, in the place's timezone. */
async function openMeteo(lat: number, lng: number, tz: string): Promise<WeatherPayload> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=precipitation_probability,precipitation&forecast_days=7&timezone=${encodeURIComponent(tz)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const j: any = await r.json();
  const days: WeatherPayload["days"] = {};
  (j.hourly.time as string[]).forEach((t, i) => {
    const [date, hhmm] = t.split("T");
    const h = String(Number(hhmm.slice(0, 2)));
    (days[date] ??= {})[h] = {
      rain: j.hourly.precipitation_probability[i] ?? 0,
      mm: j.hourly.precipitation[i] ?? 0,
    };
  });
  return { source: "Open-Meteo", days };
}

export async function fetchWeather(place: Place, fetchDate: string, _tomorrow?: string): Promise<WeatherPayload> {
  return cached(place.city, fetchDate, "weather", 12, async () => {
    try {
      const res = await serp({
        engine: "google",
        q: `weather tomorrow ${place.city}`,
        location: await serpLocation(place),
      });
      const parsed = fromAnswerBox(res, fetchDate);
      if (parsed) return parsed;
    } catch {
      /* fall through to Open-Meteo */
    }
    return openMeteo(place.lat, place.lng, place.timezone);
  });
}

/** Contiguous rainy hours become one pin each. Rain hour = >=60% chance or >=0.5 mm. */
export function rainSignals(payload: WeatherPayload, targetDate: string): Signal[] {
  const hours = payload.days[targetDate];
  if (!hours) return [];
  const rainy = (h: number) => {
    const x = hours[String(h)];
    return !!x && (x.rain >= 60 || x.mm >= 0.5);
  };
  const out: Signal[] = [];
  let h = 0;
  while (h < 24) {
    if (!rainy(h)) {
      h++;
      continue;
    }
    const s = h;
    while (h < 24 && rainy(h)) h++;
    out.push({
      kind: "rain",
      label: `Rain ${fmtHour(s)} to ${fmtHour(h)}`,
      source: payload.source,
      distanceKm: null,
      startHour: s,
      endHour: h,
      size: 1,
    });
  }
  return out;
}
