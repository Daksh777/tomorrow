import { db } from "./db";
import { fetchPlaceDetails } from "./place";
import { localDate, localHour } from "./time";
import type { Observation, Place } from "./types";

/**
 * Take Google's live reading for a place now, at most once per local hour (one SerpApi call).
 * Stores the live score, the usual score for that hour and the review count.
 */
export async function observeNow(place: Place): Promise<Observation | null> {
  const date = localDate(place.timezone);
  const hour = localHour(place.timezone);
  const sb = db();
  const { data: have, error } = await sb.from("observations").select("date, hour, live, usual, reviews").eq("place_id", place.place_id).eq("date", date).eq("hour", hour).maybeSingle();
  // No table yet (migration not run): don't spend a search on a reading we can't keep.
  if (error) throw new Error("live readings are not set up (run supabase/schema.sql)");
  if (have) return have as Observation;
  const d = await fetchPlaceDetails(place.place_id);
  return recordObservation(place, d.live, d.reviews);
}

/** Store a reading we already have (onboarding fetches the place anyway). */
export async function recordObservation(
  place: Pick<Place, "place_id" | "timezone">,
  live: { score: number | null; usual: number | null; hour: number | null },
  reviews: number | null,
): Promise<Observation | null> {
  const date = localDate(place.timezone);
  const hour = live.hour ?? localHour(place.timezone);
  const row = { place_id: place.place_id, date, hour, live: live.score, usual: live.usual, reviews };
  const { error } = await db().from("observations").upsert(row);
  if (error) return null; // table missing (migration not run): readings are optional
  return { date, hour, live: live.score, usual: live.usual, reviews };
}

export async function observationsFor(place_id: string, from: string, to: string): Promise<Observation[]> {
  const { data, error } = await db()
    .from("observations")
    .select("date, hour, live, usual, reviews")
    .eq("place_id", place_id)
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("hour");
  return error ? [] : ((data ?? []) as Observation[]);
}
