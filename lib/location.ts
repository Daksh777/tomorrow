import { cached } from "./cache";
import type { Place } from "./types";

/**
 * SerpApi's `location` must be a canonical name ("London,England,United Kingdom"); a bare "London"
 * returns UK-wide events. The Locations API is free (no search credit) and the answer never changes.
 */
export async function serpLocation(place: Pick<Place, "city" | "country">): Promise<string> {
  return cached(place.city, "static", `loc:${(place.country ?? "").toLowerCase()}`, 24 * 365, async () => {
    const r = await fetch(`https://serpapi.com/locations.json?q=${encodeURIComponent(place.city)}&limit=10`);
    if (!r.ok) return place.country ? `${place.city}, ${place.country}` : place.city;
    const rows: { canonical_name: string; target_type: string }[] = await r.json();
    const country = (place.country ?? "").toLowerCase();
    const inCountry = rows.filter((x) => !country || x.canonical_name.toLowerCase().endsWith(country));
    const pick = inCountry.find((x) => x.target_type === "City") ?? inCountry[0] ?? rows.find((x) => x.target_type === "City");
    return pick?.canonical_name ?? (place.country ? `${place.city}, ${place.country}` : place.city);
  });
}
