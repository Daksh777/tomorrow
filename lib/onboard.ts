import { db } from "./db";
import { fetchPlaceDetails, findAnchors, lookupTimezone, peerBaseline } from "./place";
import { newEditKey } from "./editkey";
import { recordObservation } from "./observe";
import { LANGUAGES, asUnit } from "./languages";
import type { Archetype } from "./types";

export const ARCHETYPES: Archetype[] = ["cafe", "restaurant", "bar", "quick_service", "cloud_kitchen", "retail", "salon"];

export interface OnboardInput {
  place_id: string;
  archetype: Archetype;
  area_type?: string;
  radius_km?: number | string;
  leagues?: string[];
  city?: string;
  country?: string | null;
  area?: string | null;
  state?: string | null;
  usual_daily?: number | string | null;
  unit?: string | null;
  language?: string | null;
}

/**
 * Save a place with the owner's choices: Google's details, popular times (or its neighbours'), anchors,
 * timezone, and the live reading the details call carries. `withKey` gives a new place an edit key.
 */
export async function savePlace(b: OnboardInput, { withKey }: { withKey: boolean }) {
  const { place_id } = b;
  const d = await fetchPlaceDetails(place_id);
  let baseline = d.baseline;
  let source: "own" | "peers" = "own";
  if (!baseline) {
    baseline = await peerBaseline(d.lat, d.lng, d.types[0] ?? "cafe", place_id);
    source = "peers";
  }
  if (!baseline) throw Object.assign(new Error("No popular-times data for this place or its neighbours"), { status: 422 });
  const radius = Number(b.radius_km) || 2;
  const [anchors, timezone] = await Promise.all([findAnchors(d.lat, d.lng, radius), lookupTimezone(d.lat, d.lng)]);

  const row = {
    place_id,
    name: d.title,
    archetype: b.archetype,
    area_type: b.area_type === "office" ? "office" : "residential",
    lat: d.lat,
    lng: d.lng,
    city: b.city || "Unknown",
    country: b.country ?? null,
    timezone,
    radius_km: radius,
    leagues: Array.isArray(b.leagues) ? b.leagues : [],
    baseline,
    baseline_source: source,
    anchors,
  };
  const key = withKey ? newEditKey() : null;
  const extra = {
    area: b.area || null,
    state: b.state || null,
    usual_daily: Number(b.usual_daily) > 0 ? Math.round(Number(b.usual_daily)) : null,
    unit: Number(b.usual_daily) > 0 ? asUnit(b.unit) : null,
    language: b.language && b.language in LANGUAGES ? b.language : "en",
    ...(key ? { edit_key_hash: key.hash } : {}),
  };
  let { error } = await db().from("places").upsert({ ...row, ...extra });
  // Later migrations add these columns; keep onboarding working if they have not been run yet.
  if (error && /area|state|usual_daily|unit|language|edit_key_hash/.test(error.message)) ({ error } = await db().from("places").upsert(row));
  if (error) throw new Error(error.message);

  // The details call already carries a live reading and the review count: keep them.
  await recordObservation({ place_id, timezone }, d.live, d.reviews).catch(() => null);
  return { name: d.title, anchors, editKey: key?.key ?? null };
}
