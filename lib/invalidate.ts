import { db } from "./db";
import { localDate } from "./time";
import type { Place } from "./types";

/**
 * Something the forecast depends on changed (a weight, a tap, settings, the owner's plans): drop the
 * cards for upcoming days and the cached week, so they rebuild on next view. Today's card stays: the
 * morning tap and "Today so far" are scored against it.
 */
export async function dropUpcoming(place: Pick<Place, "place_id" | "timezone">): Promise<void> {
  const sb = db();
  await Promise.all([
    sb.from("forecasts").delete().eq("place_id", place.place_id).gt("date", localDate(place.timezone)),
    sb.from("signal_cache").delete().eq("city", `place:${place.place_id}`).eq("kind", "week"),
  ]);
}
