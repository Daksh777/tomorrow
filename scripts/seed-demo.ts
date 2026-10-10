/**
 * Set up the demo places in config/demo.json: real restaurants with Google's real data, a week of cards,
 * and a week of scripted owner answers run through the same learning as the morning tap.
 *
 *   npm run seed-demo                 set up new places; reset every demo place's week to the script
 *   npm run seed-demo -- --refresh    also re-fetch Google details for places already saved (1 to 3 searches each)
 *   npm run seed-demo -- --only toit  just the places whose query contains "toit"
 *   npm run seed-demo -- --unscript   remove only the scripted part (answers, plans, the weights they taught); keep the places
 *   npm run seed-demo -- --remove     delete the demo places and everything stored for them
 *
 * Safe to re-run before recording: it clears the demo places' taps, weights, plans and past cards and replays
 * the script, so yesterday is unanswered again and can be tapped live. Today's card is kept (last night's
 * real forecast). Other places are not touched.
 * Demo places have no edit key, so any phone can tap them.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db";
import { buildCard, loadPlace } from "../lib/build";
import { searchPlaces } from "../lib/place";
import { savePlace } from "../lib/onboard";
import { applyTap } from "../lib/learn";
import { addDays, localDate, weekdayOf } from "../lib/time";
import demo from "../config/demo.json";
import type { Archetype, Weekday } from "../lib/types";

interface DemoPlan { weekday: Weekday; weekly: boolean; start_hour: number; end_hour: number; label: string; level: string }
interface DemoPlace {
  query: string;
  place_id?: string;
  name?: string;
  where?: string;
  archetype: Archetype;
  area_type: string;
  city: string;
  area: string;
  state: string;
  leagues?: string[];
  usual_daily: number;
  unit: string;
  language: string;
  taps: number[];
  plans: DemoPlan[];
}

const CONFIG = join(__dirname, "../config/demo.json");

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.toLowerCase() : null;
  const places = demo.places as unknown as DemoPlace[];
  const sb = db();

  if (args.includes("--unscript") || args.includes("--remove")) {
    const ids = places.map((p) => p.place_id).filter((id): id is string => !!id);
    if (args.includes("--remove")) {
      // Cards, readings, answers, weights and plans go with the place (on delete cascade).
      await sb.from("signal_cache").delete().in("city", ids.map((id) => `place:${id}`));
      const { error } = await sb.from("places").delete().in("place_id", ids);
      if (error) throw new Error(error.message);
      console.log(`deleted ${ids.length} demo places. Clear config/demo.json's places to hide them from the home page.`);
    } else {
      for (const table of ["taps", "weights", "owner_events"]) {
        const { error } = await sb.from(table).delete().in("place_id", ids);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      // Upcoming cards were built with the scripted weights: drop them so they rebuild clean.
      await sb.from("forecasts").delete().in("place_id", ids).gte("date", localDate("Asia/Kolkata"));
      console.log(`removed the scripted answers and plans from ${ids.length} demo places; Google's data stays.`);
    }
    return;
  }

  for (const p of places) {
    if (only && !p.query.toLowerCase().includes(only)) continue;
    console.log(`\n${p.query}`);

    if (!p.place_id) {
      const [hit] = await searchPlaces(p.query);
      if (!hit) { console.log("  not found on Google Maps, skipped"); continue; }
      p.place_id = hit.place_id;
      console.log(`  found ${hit.title}, ${hit.address}`);
      save(places); // keep the id even if a later step fails
    }

    const { data: have } = await sb.from("places").select("place_id").eq("place_id", p.place_id).maybeSingle();
    if (!have || refresh) {
      const { name } = await savePlace(
        { place_id: p.place_id, archetype: p.archetype, area_type: p.area_type, city: p.city, country: "India", area: p.area, state: p.state,
          leagues: p.leagues ?? [], usual_daily: p.usual_daily, unit: p.unit, language: p.language },
        { withKey: false },
      );
      p.name = name;
      p.where = [p.area, p.city].join(", ");
      save(places);
      console.log(`  saved with Google's popular times`);
    }
    // Open to any phone, so the morning tap can be shown live.
    await sb.from("places").update({ edit_key_hash: null }).eq("place_id", p.place_id);

    const place = await loadPlace(p.place_id);
    if (!place) throw new Error(`${p.query}: not saved`);
    const today = localDate(place.timezone);

    // Start the week over. Today's card stays: it is last night's real forecast (with last night's news),
    // which today's live readings are scored against, and a rebuild now would not fetch news for today.
    for (const table of ["taps", "weights", "owner_events"]) {
      const { error } = await sb.from(table).delete().eq("place_id", place.place_id);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    await sb.from("forecasts").delete().eq("place_id", place.place_id).neq("date", today);
    const { data: kept } = await sb.from("forecasts").select("date").eq("place_id", place.place_id).eq("date", today).maybeSingle();

    // The owner's plans, from their latest occurrence in the past week so last week's cards carry them too.
    for (const plan of p.plans) {
      let date = addDays(today, -7);
      while (weekdayOf(date) !== plan.weekday) date = addDays(date, 1);
      const { error } = await sb.from("owner_events").insert({
        place_id: place.place_id, date, weekly: plan.weekly, start_hour: plan.start_hour, end_hour: plan.end_hour, label: plan.label, level: plan.level,
      });
      if (error) throw new Error(`owner_events: ${error.message}`);
    }

    // Each past day: build that day's card, then the owner's answer for it, oldest first, so every answer
    // trains the weights the next card is built with. Yesterday's card is built but left unanswered.
    const said: string[] = [];
    for (let back = 7; back >= 1; back--) {
      const date = addDays(today, -back);
      const card = await buildCard(place, date, true, { draftCopy: true });
      const value = back >= 2 ? p.taps[7 - back] : undefined;
      if (value === undefined) continue;
      const r = await applyTap(place, date, value as -1 | 0 | 1);
      if (!r.ok) throw new Error(`tap ${date}: ${r.error}`);
      const changed = "changed" in r ? Object.keys(r.changed) : [];
      said.push(`${date.slice(5)} ${["quieter", "as expected", "busier"][value + 1]}${changed.length ? ` (${changed.join(", ")})` : ""}${card.forecast.pins.length ? "" : " no pins"}`);
    }
    console.log(`  answers: ${said.join("; ")}`);

    // Today's card (scored live against Google during the day) and tomorrow's, with its written copy.
    if (!kept) await buildCard(place, today, true, { draftCopy: true });
    const t = await buildCard(place, localDate(place.timezone, 1));
    console.log(`  tomorrow: ${t.copy.headline}`);
    if (t.warnings.length) console.log(`  skipped sources: ${t.warnings.join("; ")}`);
  }
  save(places);
}

/** Write ids and names back, one line per short array so the file stays readable. */
function save(places: DemoPlace[]) {
  const text = JSON.stringify({ ...demo, places }, null, 2).replace(/\[\s+([^\[\]{}]*?)\s+\]/g, (_, inner: string) => `[${inner.split(/,\s+/).join(", ")}]`);
  writeFileSync(CONFIG, text + "\n");
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
