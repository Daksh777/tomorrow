import { db } from "./db";
import { weekdayOf } from "./time";
import effects from "../config/effects.json";
import type { OwnerEvent, Signal } from "./types";

export const OWNER_LEVEL_LABEL: Record<OwnerEvent["level"], string> = {
  quieter: "Quieter",
  busier: "Busier",
  much_busier: "Much busier",
};

export async function ownerEvents(place_id: string): Promise<OwnerEvent[]> {
  const { data, error } = await db()
    .from("owner_events")
    .select("id, date, weekly, start_hour, end_hour, label, level")
    .eq("place_id", place_id)
    .order("date");
  return error ? [] : ((data ?? []) as OwnerEvent[]);
}

/** Does the event fall on this date (once, or every week from its first date)? */
export function occursOn(e: Pick<OwnerEvent, "date" | "weekly">, date: string): boolean {
  if (e.date === date) return true;
  return e.weekly && date > e.date && weekdayOf(date) === weekdayOf(e.date);
}

/** The owner's plans become pins like any other signal; the weight `own_event` learns how far to trust them. */
export function ownerEventSignals(events: OwnerEvent[], date: string): Signal[] {
  return events
    .filter((e) => occursOn(e, date))
    .map((e) => ({
      kind: "own_event" as const,
      label: e.label,
      source: "Your plans",
      detail: `You said: ${OWNER_LEVEL_LABEL[e.level].toLowerCase()}${e.weekly ? ", every week" : ""}.`,
      distanceKm: null,
      startHour: e.start_hour,
      endHour: e.end_hour,
      size: 1,
      effectOverride: effects.own_event[e.level],
    }));
}
