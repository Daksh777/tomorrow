import { cached } from "../cache";
import { findPeers } from "../place";
import { haversineKm } from "../geo";
import { addDays, weekdayOf } from "../time";
import effects from "../../config/effects.json";
import type { Peer, Place, Signal } from "../types";

const ARCH_QUERY: Record<string, string> = {
  cafe: "cafe",
  restaurant: "restaurant",
  bar: "bar",
  quick_service: "fast food",
  cloud_kitchen: "cloud kitchen",
  retail: "store",
  salon: "salon",
};

/** Weekly per place: one Google Maps search; hours come with the search rows. */
export async function fetchPeers(place: Place, fetchDate: string): Promise<Peer[]> {
  // Keyed by the Monday of the week, so it is refreshed once a week.
  const back = (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).indexOf(weekdayOf(fetchDate) as any);
  const week = addDays(fetchDate, -Math.max(0, back));
  return cached(`place:${place.place_id}`, week, "peers", 24 * 8, () =>
    findPeers(place.lat, place.lng, ARCH_QUERY[place.archetype] ?? "cafe", place.place_id, effects.competitor.radius_km),
  );
}

export function closedOn(peer: Peer, targetDate: string): boolean {
  if (peer.closed) return true;
  const h = peer.hours?.[weekdayOf(targetDate)];
  return !!h && /^closed$/i.test(h.trim());
}

export function competitorSignals(place: Place, peers: Peer[], targetDate: string): Signal[] {
  const c = effects.competitor;
  // Only when you are open that day.
  if (!place.baseline[weekdayOf(targetDate)]?.some((v) => v !== null && v > 0)) return [];
  const shut = peers
    .filter((p) => closedOn(p, targetDate))
    .map((p) => ({ p, d: haversineKm(place, p) }))
    .filter((x) => x.d <= c.radius_km);
  if (!shut.length) return [];
  const effect = Math.min(c.cap, shut.reduce((a, x) => a + c.per_peer * Math.max(0, 1 - x.d / c.radius_km), 0));
  if (effect <= 0.005) return [];
  const names = shut.map((x) => x.p.name);
  return [
    {
      kind: "competitor",
      label: shut.length === 1 ? `${names[0]} is closed tomorrow` : `${shut.length} places like yours nearby are closed tomorrow`,
      source: "Google Maps hours",
      // Distance is already in the effect (falloff to zero at 1 km), so the pin carries none.
      detail: `Closed: ${names.join(", ")} (nearest ${Math.round(Math.min(...shut.map((x) => x.d)) * 1000)} m). Some of their regulars come to you.`,
      distanceKm: null,
      startHour: 0,
      endHour: 24,
      size: 1,
      effectOverride: effect,
    },
  ];
}
