/**
 * Day-1 script: call every SerpApi endpoint for real places and save the raw JSON to /fixtures.
 *
 *   SERPAPI_API_KEY=... npm run fixtures -- "Third Wave Coffee MG Road Bengaluru"
 *
 * Pass any business name. For the demo, run it for one café near M. Chinnaswamy Stadium,
 * one in a residential area, and one in another country.
 */
process.env.SAVE_FIXTURES = "1";

import { cityCountryFromAddress, findAnchors, fetchPlaceDetails, searchPlaces } from "../lib/place";
import { serp } from "../lib/serp";
import { leagueIds } from "../lib/signals/matches";

async function main() {
  const query = process.argv.slice(2).join(" ");
  if (!query) throw new Error('Usage: npm run fixtures -- "<business name and area>"');

  const hits = await searchPlaces(query);
  const top = hits[0];
  if (!top) throw new Error("No Maps results");
  console.log("place:", top.title, top.place_id, top.address);

  const d = await fetchPlaceDetails(top.place_id);
  console.log("popular times:", d.baseline ? "yes" : "no", "| live:", d.live);

  const anchors = await findAnchors(d.lat, d.lng, 2);
  console.log("anchors within 2 km:", anchors.map((a) => `${a.kind}:${a.name}`));

  const city = cityCountryFromAddress(top.address).city || query;
  await serp({ engine: "google", q: "events this week", location: city });
  await serp({ engine: "google", q: `weather tomorrow ${city}`, location: city });
  await serp({ engine: "google_news", q: `${city} road closure OR strike OR bandh` });

  const start = new Date();
  const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z");
  for (const [name, kgmid] of Object.entries(leagueIds())) {
    console.log("league:", name);
    await serp({ engine: "google_sports", type: "league", tab: "gm", sp: "ft", kgmid, moa: iso(start), mob: iso(new Date(start.getTime() + 8 * 86400000)) });
  }
  console.log("Saved raw responses under /fixtures");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
