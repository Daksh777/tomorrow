/**
 * Simulate "yesterday evening's card" so the morning tap appears today.
 *
 *   npm run seed-today -- <place_id>            build a forecast dated TODAY
 *   npm run seed-today -- <place_id> 2026-10-10 build one for a specific date (and tap it via /api/tap)
 *
 * The morning tap is only offered when a forecast row exists for today's local date and no tap exists yet.
 * Real flow: the 18:00 cron builds tomorrow's card, and tomorrow morning that row is "today".
 */
import { buildCard, loadPlace } from "../lib/build";
import { localDate } from "../lib/time";

async function main() {
  const [place_id, date] = process.argv.slice(2);
  if (!place_id) throw new Error("Usage: npm run seed-today -- <place_id> [YYYY-MM-DD]");
  const place = await loadPlace(place_id);
  if (!place) throw new Error(`Unknown place ${place_id}. Onboard it first.`);
  const target = date ?? localDate(place.timezone);
  const c = await buildCard(place, target);
  console.log(`built ${place.name} for ${target}`);
  console.log("pins:", c.forecast.pins.map((p) => `${p.kind}: ${p.label}`));
  console.log("A forecast dated", target, "now exists. Open /p/" + place_id + " to see the morning tap (if the date is today).");
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
