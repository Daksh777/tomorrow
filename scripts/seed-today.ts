/**
 * Simulate a forecast for yesterday so the morning tap ("How was yesterday?") appears today.
 *
 *   npm run seed-today -- <place_id>            build a forecast dated YESTERDAY
 *   npm run seed-today -- <place_id> 2026-10-10 build one for a specific date (and tap it via /api/tap)
 *
 * The morning tap is offered when a forecast row exists for yesterday's local date.
 * Real flow: the 18:00 cron builds tomorrow's card; the morning after that day, the owner says how it went.
 */
import { buildCard, loadPlace } from "../lib/build";
import { localDate } from "../lib/time";

async function main() {
  const [place_id, date] = process.argv.slice(2);
  if (!place_id) throw new Error("Usage: npm run seed-today -- <place_id> [YYYY-MM-DD]");
  const place = await loadPlace(place_id);
  if (!place) throw new Error(`Unknown place ${place_id}. Onboard it first.`);
  const target = date ?? localDate(place.timezone, -1);
  const c = await buildCard(place, target);
  console.log(`built ${place.name} for ${target}`);
  console.log("pins:", c.forecast.pins.map((p) => `${p.kind}: ${p.label}`));
  console.log("A forecast dated", target, "now exists. Open /p/" + place_id + " to see the morning tap (if the date is yesterday).");
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
