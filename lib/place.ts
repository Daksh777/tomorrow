import { serp } from "./serp";
import { haversineKm } from "./geo";
import {
  WEEKDAYS,
  type Peer,
  type Anchor,
  type Archetype,
  type Baseline,
  type DayCurve,
  type Weekday,
} from "./types";

export interface PlaceHit {
  place_id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  type: string[];
  reviews?: number;
}

/** Onboarding step 1: Google Maps search (engine=google_maps, type=search). */
export async function searchPlaces(q: string, ll?: string): Promise<PlaceHit[]> {
  const res = await serp({ engine: "google_maps", type: "search", q, ll });
  const rows: any[] = res.local_results ?? (res.place_results ? [res.place_results] : []);
  return rows
    .filter((r) => r.place_id && r.gps_coordinates)
    .map((r) => ({
      place_id: r.place_id,
      title: r.title,
      address: r.address ?? "",
      lat: r.gps_coordinates.latitude,
      lng: r.gps_coordinates.longitude,
      type: Array.isArray(r.types) ? r.types : r.type ? [].concat(r.type) : [],
      reviews: r.reviews,
    }));
}

/** "6 AM" / "12 PM" / "11 PM" -> 0..23 */
export function parseHourLabel(label: string): number | null {
  const m = /^\s*(\d{1,2})\s*(AM|PM)\s*$/i.exec(label);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[2].toUpperCase() === "PM") h += 12;
  return h;
}

/** popular_times.graph_results[day][] -> 24-hour curve (null where Google has no data). */
export function curvesFromPopularTimes(popular: any): Baseline | null {
  const g = popular?.graph_results;
  if (!g) return null;
  const out = {} as Baseline;
  let any = false;
  for (const day of WEEKDAYS) {
    const curve: DayCurve = Array(24).fill(null);
    for (const pt of g[day] ?? []) {
      const h = parseHourLabel(String(pt.time));
      if (h !== null && typeof pt.busyness_score === "number") {
        curve[h] = pt.busyness_score;
        any = true;
      }
    }
    out[day] = curve;
  }
  return any ? out : null;
}

export interface PlaceDetails {
  place_id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  reviews: number;
  baseline: Baseline | null;
  /** Google's live reading for the current hour (graph_results[day][i].live_busyness_score where current=true). */
  live: { score: number | null; usual: number | null; hour: number | null; info: string | null };
  /** weekday -> "8 AM–12 AM" | "Closed" */
  hours: Partial<Record<Weekday, string>> | null;
  /** "Temporarily closed" / "Permanently closed" */
  closed: string | null;
  events: any[];
}

/**
 * Real shape (fixtures/google-maps-ChIJoVIBOaUXrjsRbF451NgeXrA-1791559003173.json): the live score sits
 * on the current hour's point inside graph_results, next to that hour's usual score; live_hash only
 * carries words ("A little busy"). There is no top-level live_busyness_score.
 */
export function liveFromPopularTimes(popular: any): PlaceDetails["live"] {
  const info = popular?.live_hash?.info ?? null;
  for (const day of Object.values(popular?.graph_results ?? {}) as any[]) {
    for (const pt of Array.isArray(day) ? day : []) {
      if (!pt?.current) continue;
      return {
        score: typeof pt.live_busyness_score === "number" ? pt.live_busyness_score : null,
        usual: typeof pt.busyness_score === "number" ? pt.busyness_score : null,
        hour: parseHourLabel(String(pt.time)),
        info,
      };
    }
  }
  return { score: null, usual: null, hour: null, info };
}

/** hours: [{ friday: "8 AM–12 AM" }, ...] -> { friday: "8 AM–12 AM", ... } */
export function hoursFrom(raw: any): Partial<Record<Weekday, string>> | null {
  if (!Array.isArray(raw)) return raw && typeof raw === "object" ? (raw as any) : null;
  const out: Partial<Record<Weekday, string>> = {};
  for (const row of raw) for (const [k, v] of Object.entries(row ?? {})) if ((WEEKDAYS as readonly string[]).includes(k)) out[k as Weekday] = String(v);
  return Object.keys(out).length ? out : null;
}

/** Your weekly rhythm: engine=google_maps, place_id=<id>. */
export async function fetchPlaceDetails(place_id: string): Promise<PlaceDetails> {
  const res = await serp({ engine: "google_maps", place_id });
  const p = res.place_results ?? res;
  const popular = p.popular_times ?? res.popular_times;
  return {
    place_id,
    title: p.title,
    address: p.address ?? "",
    lat: p.gps_coordinates?.latitude,
    lng: p.gps_coordinates?.longitude,
    types: Array.isArray(p.type) ? p.type : p.type ? [p.type] : [],
    reviews: p.reviews ?? 0,
    baseline: curvesFromPopularTimes(popular),
    live: liveFromPopularTimes(popular),
    hours: hoursFrom(p.hours ?? p.operating_hours),
    closed: /closed/i.test(String(p.open_state ?? "")) && /temporar|permanent/i.test(String(p.open_state)) ? String(p.open_state) : null,
    events: p.events ?? res.events ?? [],
  };
}

/** Suggest an archetype from Google's place types. Owner confirms it. */
const ARCHETYPE_RULES: [Archetype, RegExp][] = [
  ["cloud_kitchen", /\b(cloud kitchen|ghost kitchen)\b/],
  ["bar", /\b(bar|pub|brewery|brewpub|lounge|nightclub|taproom)\b/],
  ["cafe", /\b(caf[eé]|coffee|tea|bakery|dessert|juice|ice cream)\b/],
  ["quick_service", /\b(fast food|quick|takeaway|take-out|snack|food court)\b/],
  ["salon", /\b(salon|spa|barber|beauty)\b/],
  ["restaurant", /\b(restaurant|dhaba|eatery|diner|biryani)\b/],
  ["retail", /\b(store|shop|boutique|supermarket|retail|market)\b/],
];

/** Google lists the primary type first ("Coffee shop", "Cafe"); judge it before the rest. */
export function guessArchetype(types: string[]): Archetype {
  const lower = types.map((x) => x.toLowerCase());
  for (const group of [lower.slice(0, 1), lower]) {
    const t = group.join(" | ");
    for (const [a, re] of ARCHETYPE_RULES) if (re.test(t)) return a;
  }
  return "cafe";
}

/** Rough "City" and "Country" from a Google address string. */
export function cityCountryFromAddress(address: string): { city: string; country: string | null; area: string | null; state: string | null } {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const country = parts.length ? parts[parts.length - 1].replace(/\d+/g, "").trim() || null : null;
  // The part before the country holds the city, or "State ZIP" (India, US), in which case the
  // city is one earlier. Layouts seen: "Bengaluru, Karnataka 560001", "London SE1 9AB",
  // "75001 Paris", "Sydney NSW 2000", "Brooklyn, NY 11201".
  const before = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? "");
  const earlier = parts.length >= 3 ? parts[parts.length - 3] : before;
  const ukPost = /\s*\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;
  let city: string;
  if (ukPost.test(before)) city = before.replace(ukPost, "");
  else if (/^\d/.test(before)) city = before.replace(/^[\d\s-]+/, "");
  else if (/^(.+?)\s+[A-Z]{2,3}\s+\d{4,5}$/.test(before)) city = before.replace(/\s+[A-Z]{2,3}\s+\d{4,5}$/, "");
  else if (/\d/.test(before)) city = earlier;
  else city = before;
  city = city.replace(/\d+/g, "").trim();
  // Area = the part just before the city, unless it is a street or building line ("2 Park St").
  const at = parts.findIndex((x) => x.replace(/\d+/g, "").trim() === city);
  const cand = at > 0 ? parts[at - 1] : "";
  const area = cand && !/^\d|\b(st|street|road|rd|marg|lane|ln|floor|building|plot|shop)\b/i.test(cand) ? cand : null;
  // "Karnataka 560001" / "Delhi 110001" sit just before the country in Indian addresses.
  const stateRaw = (parts[parts.length - 2] ?? "").replace(/\d+/g, "").trim();
  const state = country?.toLowerCase() === "india" && stateRaw ? stateRaw : null;
  return { city, country, area, state };
}

export function countryCode(country: string | null): string {
  const c = (country ?? "").toLowerCase();
  const map: Record<string, string> = {
    india: "IN",
    "united states": "US",
    usa: "US",
    "united kingdom": "GB",
    uk: "GB",
    canada: "CA",
    australia: "AU",
    ireland: "IE",
  };
  return map[c] ?? "IN";
}

const ANCHOR_QUERIES: { q: string; kind: Anchor["kind"] }[] = [
  { q: "stadium", kind: "stadium" },
  { q: "college", kind: "college" },
  { q: "mall", kind: "mall" },
  { q: "event venue", kind: "venue" },
];

/**
 * Nearby anchors: engine=google_maps, type=search, q=<anchor>, ll=@lat,lng,14z.
 * Keeps those within radiusKm.
 */
export async function findAnchors(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<Anchor[]> {
  const out: Anchor[] = [];
  for (const { q, kind } of ANCHOR_QUERIES) {
    const res = await serp({
      engine: "google_maps",
      type: "search",
      q,
      ll: `@${lat},${lng},14z`,
    });
    for (const r of res.local_results ?? []) {
      const g = r.gps_coordinates;
      if (!g) continue;
      const d = haversineKm({ lat, lng }, { lat: g.latitude, lng: g.longitude });
      if (d <= radiusKm) {
        out.push({
          kind,
          name: r.title,
          place_id: r.place_id,
          lat: g.latitude,
          lng: g.longitude,
          reviews: r.reviews,
        });
      }
    }
  }
  // Real results list a stadium's gates and stands separately ("E13 M Chinnaswamy Stadium"):
  // keep the first anchor of each kind within 300 m.
  const kept: Anchor[] = [];
  for (const a of out) {
    if (kept.some((k) => k.kind === a.kind && haversineKm(k, a) < 0.3)) continue;
    kept.push(a);
  }
  return kept;
}

/**
 * Fallback when a place has no popular times: average the curves of the 3
 * nearest places of the same type. Labelled "based on places like yours".
 */
export async function peerBaseline(
  lat: number,
  lng: number,
  typeQuery: string,
  excludePlaceId: string,
): Promise<Baseline | null> {
  const res = await serp({
    engine: "google_maps",
    type: "search",
    q: typeQuery,
    ll: `@${lat},${lng},15z`,
  });
  const peers = (res.local_results ?? [])
    .filter((r: any) => r.place_id && r.place_id !== excludePlaceId && r.gps_coordinates)
    .sort(
      (a: any, b: any) =>
        haversineKm({ lat, lng }, { lat: a.gps_coordinates.latitude, lng: a.gps_coordinates.longitude }) -
        haversineKm({ lat, lng }, { lat: b.gps_coordinates.latitude, lng: b.gps_coordinates.longitude }),
    );

  const curves: Baseline[] = [];
  for (const p of peers) {
    if (curves.length >= 3) break;
    const d = await fetchPlaceDetails(p.place_id);
    if (d.baseline) curves.push(d.baseline);
  }
  if (!curves.length) return null;

  const out = {} as Baseline;
  for (const day of WEEKDAYS) {
    out[day] = Array.from({ length: 24 }, (_, h) => {
      const vals = curves.map((c) => c[day][h]).filter((v): v is number => v !== null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    });
  }
  return out;
}

export function usualDay(baseline: Baseline, day: Weekday): DayCurve {
  return baseline[day];
}

/** Best-effort IANA timezone. Open-Meteo returns it for any lat/lng. */
export async function lookupTimezone(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m&forecast_days=1&timezone=auto`,
    );
    if (r.ok) {
      const j: any = await r.json();
      if (j.timezone) return j.timezone;
    }
  } catch {
    /* fall through */
  }
  return lat > 6 && lat < 36 && lng > 68 && lng < 98 ? "Asia/Kolkata" : "UTC";
}

/**
 * Up to 5 nearby places of the same type, with their weekly hours: if one is shut tomorrow, some of its
 * crowd comes to you. One search plus one details call each, refreshed weekly (lib/signals/competitors.ts).
 */
export async function findPeers(lat: number, lng: number, typeQuery: string, excludePlaceId: string, radiusKm = 1): Promise<Peer[]> {
  const res = await serp({ engine: "google_maps", type: "search", q: typeQuery, ll: `@${lat},${lng},16z` });
  const near = (res.local_results ?? [])
    .filter((r: any) => r.place_id && r.place_id !== excludePlaceId && r.gps_coordinates)
    .map((r: any) => ({ r, d: haversineKm({ lat, lng }, { lat: r.gps_coordinates.latitude, lng: r.gps_coordinates.longitude }) }))
    .filter((x: any) => x.d <= radiusKm)
    .sort((a: any, b: any) => a.d - b.d)
    .slice(0, 5);
  const out: Peer[] = [];
  for (const { r } of near) {
    // Search rows often carry hours already; only fetch details when they don't.
    let hours = hoursFrom(r.operating_hours ?? r.hours);
    let closed: string | null = /temporar|permanent/i.test(String(r.open_state ?? "")) ? String(r.open_state) : null;
    if (!hours) {
      try {
        const d = await fetchPlaceDetails(r.place_id);
        hours = d.hours;
        closed = d.closed;
      } catch {
        /* keep the peer without hours */
      }
    }
    out.push({ place_id: r.place_id, name: r.title, lat: r.gps_coordinates.latitude, lng: r.gps_coordinates.longitude, hours, closed });
  }
  return out;
}
