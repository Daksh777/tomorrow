import { db } from "./db";
import { forecast, type Weights } from "./forecast";
import { writeCopy } from "./copy";
import { localDate } from "./time";
import { eventSignals, fetchEvents } from "./signals/events";
import { fetchMatches, matchSignals } from "./signals/matches";
import { fetchWeather, rainSignals } from "./signals/weather";
import { classifyHeadlines, disruptionSignals, fetchNews } from "./signals/news";
import { holidaySignals, longWeekendSignals } from "./signals/holidays";
import { airSignals, fetchAir } from "./signals/air";
import { calendarSignals, paydaySignals } from "./india";
import type { Copy, Forecast, Place, Signal, SignalKind } from "./types";

export async function loadPlace(place_id: string): Promise<Place | null> {
  const { data } = await db().from("places").select("*").eq("place_id", place_id).maybeSingle();
  return (data as Place | null) ?? null;
}

export async function loadWeightRows(place_id: string): Promise<{ weights: Weights; ownerSet: SignalKind[] }> {
  let { data, error } = await db().from("weights").select("signal_kind, w, owner_set").eq("place_id", place_id);
  // Until the owner_set migration has run, still honour weights learned from taps.
  if (error) ({ data } = (await db().from("weights").select("signal_kind, w").eq("place_id", place_id)) as any);
  const weights: Weights = {};
  const ownerSet: SignalKind[] = [];
  for (const r of data ?? []) {
    weights[r.signal_kind as keyof Weights] = r.w;
    if (r.owner_set) ownerSet.push(r.signal_kind as SignalKind);
  }
  return { weights, ownerSet };
}

async function tapCount(place_id: string): Promise<number> {
  const { count } = await db()
    .from("taps")
    .select("*", { count: "exact", head: true })
    .eq("place_id", place_id);
  return count ?? 0;
}

/** City-level fetches are shared and cached; each failed source is skipped, never faked. */
export async function gatherSignals(place: Place, targetDate: string): Promise<{ signals: Signal[]; warnings: string[] }> {
  const fetchDate = localDate(place.timezone);
  const tomorrow = localDate(place.timezone, 1);
  const warnings: string[] = [];
  const signals: Signal[] = [];

  signals.push(...holidaySignals(place, targetDate));
  signals.push(...longWeekendSignals(place, targetDate));
  signals.push(...calendarSignals(place, targetDate));
  signals.push(...paydaySignals(place, targetDate));

  try {
    signals.push(...(await eventSignals(place, fetchDate, targetDate, await fetchEvents(place, fetchDate))));
  } catch (e: any) {
    warnings.push(`events: ${e.message}`);
  }

  for (const league of place.leagues) {
    try {
      signals.push(...matchSignals(place, targetDate, await fetchMatches(place.city, league, fetchDate)));
    } catch (e: any) {
      warnings.push(`matches(${league}): ${e.message}`);
    }
  }

  try {
    signals.push(...rainSignals(await fetchWeather(place, fetchDate, tomorrow), targetDate));
  } catch (e: any) {
    warnings.push(`weather: ${e.message}`);
  }

  try {
    signals.push(...airSignals(place, await fetchAir(place, fetchDate), targetDate));
  } catch (e: any) {
    warnings.push(`air: ${e.message}`);
  }

  // Headlines are from the last 24 h, so they only describe tomorrow.
  if (targetDate === tomorrow) {
    try {
      const rel = await classifyHeadlines(place, await fetchNews(place, fetchDate), new Date(), targetDate);
      signals.push(...disruptionSignals(rel));
    } catch (e: any) {
      warnings.push(`news: ${e.message}`);
    }
  }

  return { signals, warnings };
}

export interface Card {
  forecast: Forecast;
  copy: Copy;
  warnings: string[];
}

/** Build and store the evening card for one place and date. */
export async function buildCard(place: Place, targetDate: string, withCopy = true): Promise<Card> {
  const [{ signals, warnings }, { weights, ownerSet }, taps] = await Promise.all([
    gatherSignals(place, targetDate),
    loadWeightRows(place.place_id),
    tapCount(place.place_id),
  ]);

  const f = forecast({
    date: targetDate,
    baseline: place.baseline,
    baselineSource: place.baseline_source,
    archetype: place.archetype,
    radiusKm: place.radius_km,
    signals,
    weights,
    ownerSet,
    taps,
  });

  const copy = withCopy ? await writeCopy(f, place.name) : { headline: "", actions: ["", ""] as [string, string] };

  if (withCopy) {
    await db().from("forecasts").upsert({
      place_id: place.place_id,
      date: targetDate,
      hourly: { hourly: f.hourly, lo: f.lo, hi: f.hi, baseline: f.baseline },
      buckets: { buckets: f.buckets, ratios: f.ratios, taps: f.taps, tuned: f.tuned, baselineSource: f.baselineSource },
      pins: f.pins,
      copy,
      band: f.band,
    });
  }
  return { forecast: f, copy, warnings };
}
