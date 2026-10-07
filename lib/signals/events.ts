import { serp } from "../serp";
import { cached } from "../cache";
import { serpLocation } from "../location";
import { haversineKm } from "../geo";
import { fmtHour } from "../time";
import type { Place, Signal } from "../types";
import config from "../../config/effects.json";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Local events: engine=google, q="events in <area>", location=<city>. One call per city per day. */
export async function fetchEvents(place: Place, fetchDate: string): Promise<any[]> {
  return cached(place.city, fetchDate, "events", 24, async () => {
    const location = (await serpLocation(place)).replace(/,(?=\S)/g, ", ");
    // Google's events block comes and goes between identical requests; try a second phrasing.
    for (const q of ["events this week", `events in ${place.city} this week`]) {
      const res = await serp({ engine: "google", q, location });
      if (res.events_results?.length) return res.events_results;
    }
    // Throw rather than cache an empty list for the whole day.
    throw new Error("Google returned no events block for this city");
  });
}

/** "Oct 8" (no year) -> "YYYY-MM-DD" using the year of the target date. */
function eventDateISO(startDate: unknown, year: number): string | null {
  if (typeof startDate !== "string") return null;
  const m = /([A-Za-z]{3})[a-z]*\s+(\d{1,2})/.exec(startDate);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${year}-${String(mi + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** "Thu, 7 – 10 PM", "Fri, 7:30 PM", "Sat, 4 PM – 9 PM" -> [start, end] hours. */
export function parseTimes(when: string | undefined): [number, number] | null {
  if (!when) return null;
  const t = when.replace(/^[A-Za-z]{3,9},?\s*/, "");
  const re = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/gi;
  const hits: { h: number; m: number; ap?: string }[] = [];
  let x: RegExpExecArray | null;
  while ((x = re.exec(t))) hits.push({ h: Number(x[1]), m: Number(x[2] ?? 0), ap: x[3]?.toUpperCase() });
  if (!hits.length) return null;
  const toH = (h: number, m: number, ap: string) => (h % 12) + (ap === "PM" ? 12 : 0) + m / 60;
  const endAp = hits[hits.length - 1].ap ?? "PM";
  const start = hits[0];
  const s = toH(start.h, start.m, start.ap ?? endAp);
  if (hits.length === 1) return [s, s + 3];
  const e = hits[hits.length - 1];
  let end = toH(e.h, e.m, endAp);
  if (end <= s) end += 12 > end - s + 12 ? 0 : 12;
  if (end <= s) end = s + 3;
  return [s, end];
}

/** Events carry an address, not coordinates: resolve the venue with one cached Maps search. */
async function resolveVenue(
  place: Place,
  fetchDate: string,
  venue: string,
): Promise<{ lat: number; lng: number; reviews: number } | null> {
  return cached(place.city, fetchDate, `geo:${venue.toLowerCase()}`, 24 * 30, async () => {
    const res = await serp({
      engine: "google_maps",
      type: "search",
      q: venue,
      ll: `@${place.lat},${place.lng},13z`,
    });
    const r = (res.local_results ?? [])[0] ?? res.place_results;
    if (!r?.gps_coordinates) return null;
    return {
      lat: r.gps_coordinates.latitude,
      lng: r.gps_coordinates.longitude,
      reviews: r.reviews ?? 0,
    };
  });
}

/** Venue review count as a rough capacity proxy: small / medium / large. */
export function sizeFromReviews(reviews: number): number {
  if (reviews >= 5000) return 1;
  if (reviews >= 500) return 0.85;
  return 0.6;
}

export async function eventSignals(
  place: Place,
  fetchDate: string,
  targetDate: string,
  raw: any[],
): Promise<Signal[]> {
  const year = Number(targetDate.slice(0, 4));
  const maxKm = Math.min(config.windows.event_radius_km, place.radius_km);
  const out: Signal[] = [];
  let resolved = 0;

  for (const ev of raw) {
    if (eventDateISO(ev.date?.start_date ?? ev.date, year) !== targetDate) continue;
    const venueName: string | undefined =
      ev.venue?.name ?? (Array.isArray(ev.address) ? ev.address[0] : undefined);
    if (!venueName || resolved >= 8) continue;
    resolved++;

    const geo = await resolveVenue(place, fetchDate, venueName);
    if (!geo) continue;
    const d = haversineKm(place, geo);
    if (d > maxKm) continue;

    const t = parseTimes(ev.time ?? ev.date?.when) ?? [17, 21];
    const end = t[1] + config.windows.event_after_hours;
    out.push({
      kind: "event",
      label: `${ev.title} ${fmtHour(t[0])} to ${fmtHour(t[1])}`,
      source: "Google Events",
      detail: venueName,
      distanceKm: d,
      startHour: t[0],
      endHour: end,
      size: sizeFromReviews(geo.reviews),
    });
  }
  return out;
}
