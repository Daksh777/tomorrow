import { serp } from "../serp";
import { cached } from "../cache";
import { serpLocation } from "../location";
import { fmtHour } from "../time";
import effects from "../../config/effects.json";
import type { Place, Signal } from "../types";

export interface WeatherPayload {
  source: "SerpApi answer box" | "Open-Meteo" | "SerpApi answer box, Open-Meteo amounts";
  /** date -> hour(0..23) -> { rain: 0..100 probability, mm, feels: feels-like °C when known } */
  days: Record<string, Record<string, { rain: number; mm: number; feels?: number }>>;
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
  const fahrenheit = !/celsius/i.test(String(res.answer_box?.unit ?? "Fahrenheit"));
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
    const t = parseFloat(String(r.temperature ?? ""));
    const rh = parseFloat(String(r.humidity ?? ""));
    const tc = isNaN(t) ? null : fahrenheit ? ((t - 32) * 5) / 9 : t;
    const row: { rain: number; mm: number; feels?: number } = { rain: isNaN(p) ? 0 : p, mm: 0 };
    if (tc !== null) row.feels = Math.round(heatIndexC(tc, isNaN(rh) ? 50 : rh) * 10) / 10;
    (days[date] ??= {})[String(h)] ??= row;
  }
  return Object.keys(days).length ? { source: "SerpApi answer box", days } : null;
}

/** Fallback: Open-Meteo (free, not SerpApi). Seven days, hourly, in the place's timezone. */
async function openMeteo(lat: number, lng: number, tz: string): Promise<WeatherPayload> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=precipitation_probability,precipitation,apparent_temperature&forecast_days=7&timezone=${encodeURIComponent(tz)}`;
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
      ...(typeof j.hourly.apparent_temperature?.[i] === "number" ? { feels: j.hourly.apparent_temperature[i] } : {}),
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
      if (parsed) {
        // Google gives the chance of rain but no amount: add Open-Meteo's millimetres (free) when it answers.
        const amounts = await openMeteo(place.lat, place.lng, place.timezone).catch(() => null);
        return amounts ? withAmounts(parsed, amounts) : parsed;
      }
    } catch {
      /* fall through to Open-Meteo */
    }
    return openMeteo(place.lat, place.lng, place.timezone);
  });
}

/** Google's chance of rain and feels-like, with Open-Meteo's mm for the same local hour. */
export function withAmounts(google: WeatherPayload, meteo: WeatherPayload): WeatherPayload {
  const days: WeatherPayload["days"] = {};
  let merged = false;
  for (const [date, hours] of Object.entries(google.days)) {
    days[date] = {};
    for (const [h, row] of Object.entries(hours)) {
      const mm = meteo.days[date]?.[h]?.mm;
      if (typeof mm === "number") merged = true;
      days[date][h] = { ...row, mm: typeof mm === "number" ? mm : row.mm };
    }
  }
  return merged ? { source: "SerpApi answer box, Open-Meteo amounts", days } : google;
}

/**
 * Contiguous rainy hours become one pin each. Rain hour = >=60% chance or >=0.5 mm. The pin's size
 * follows the peak amount in the stretch (light, moderate, heavy); when real rain stops in the day,
 * an "after the rain" pin covers the next hours.
 */
export function rainSignals(payload: WeatherPayload, targetDate: string, archetype?: string): Signal[] {
  const hours = payload.days[targetDate];
  if (!hours) return [];
  const ri = effects.rain_intensity;
  const ar = effects.after_rain;
  // Answer-box-only payloads carry mm = 0 everywhere: no amounts known, so no intensity either way.
  const known = payload.source !== "SerpApi answer box";
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
    let peak = 0;
    while (h < 24 && rainy(h)) peak = Math.max(peak, hours[String(h++)].mm);
    const heavy = known && peak >= ri.heavy.from_mm;
    const light = known && peak < ri.light.below_mm;
    const amount = known && peak > 0 ? ` (up to ${peak >= 10 ? Math.round(peak) : peak.toFixed(1)} mm an hour)` : "";
    out.push({
      kind: "rain",
      label: `${heavy ? "Heavy rain" : light ? "Light rain" : "Rain"} ${fmtHour(s)} to ${fmtHour(h)}`,
      source: payload.source,
      ...(amount ? { detail: `Chance of rain and amount${amount}.` } : {}),
      distanceKm: null,
      startHour: s,
      endHour: h,
      size: heavy ? ri.heavy.size : light ? ri.light.size : 1,
    });
    const eff = archetype ? (ar.effect as Record<string, number>)[archetype] : undefined;
    if (eff && known && peak >= ar.min_peak_mm && h >= ar.window[0] && h <= ar.window[1] && !rainy(h)) {
      out.push({
        kind: "after_rain",
        label: `After the rain, ${fmtHour(h)} to ${fmtHour(h + ar.hours)}`,
        source: payload.source,
        detail: "People who waited the rain out come out for a couple of hours. A starting guess that your taps tune.",
        distanceKm: null,
        startHour: h,
        endHour: h + ar.hours,
        size: 1,
        effectOverride: eff,
      });
    }
  }
  return out;
}

/**
 * Feels-like temperature (°C) from air temperature and relative humidity: the US NWS heat index
 * (Rothfusz regression), which is the usual one. Below 27 °C it is just the temperature.
 */
export function heatIndexC(tc: number, rh: number): number {
  if (tc < 27) return tc;
  const T = (tc * 9) / 5 + 32;
  const hi =
    -42.379 + 2.04901523 * T + 10.14333127 * rh - 0.22475541 * T * rh - 0.00683783 * T * T -
    0.05481717 * rh * rh + 0.00122874 * T * T * rh + 0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh;
  return ((hi - 32) * 5) / 9;
}

/** Contiguous hours whose feels-like temperature reaches the threshold become one pin. */
export function heatSignals(place: Place, payload: WeatherPayload, targetDate: string): Signal[] {
  const hours = payload.days[targetDate];
  const c = effects.heat;
  const base = (c.effect as Record<string, number>)[place.archetype] ?? 0;
  if (!hours || !base) return [];
  const hot = (h: number) => (hours[String(h)]?.feels ?? -99) >= c.min_feels_c;
  const out: Signal[] = [];
  let h = 0;
  while (h < 24) {
    if (!hot(h)) {
      h++;
      continue;
    }
    const s = h;
    let peak = 0;
    while (h < 24 && hot(h)) peak = Math.max(peak, hours[String(h++)].feels!);
    out.push({
      kind: "heat",
      label: `Feels like ${Math.round(peak)}°C, ${fmtHour(s)} to ${fmtHour(h)}`,
      source: payload.source,
      detail: "Heat keeps people off the street in the afternoon; delivery picks up.",
      distanceKm: null,
      startHour: s,
      endHour: h,
      size: 1,
      effectOverride: base,
    });
  }
  return out;
}
