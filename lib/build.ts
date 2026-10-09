import { db } from "./db";
import { calibrateBand, forecast, type Weights } from "./forecast";
import { writeCopy } from "./copy";
import { addDays, localDate } from "./time";
import { eventSignals, fetchEvents } from "./signals/events";
import { fetchMatches, matchSignals } from "./signals/matches";
import { fetchWeather, heatSignals, rainSignals } from "./signals/weather";
import { classifyHeadlines, disruptionSignals, fetchNews } from "./signals/news";
import { holidaySignals, longWeekendSignals } from "./signals/holidays";
import { airSignals, fetchAir } from "./signals/air";
import { fetchHotels, hotelSignals } from "./signals/hotels";
import { competitorSignals, fetchPeers } from "./signals/competitors";
import { trendSignals } from "./signals/trend";
import { fetchInterest, measuredObservance, trendsTerm } from "./signals/trends";
import { observationsFor } from "./observe";
import { applyDrinkingCulture, calendarSignals, examSignals, festivalsOn, paydaySignals, stateOf, type MeasuredObservance } from "./india";
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

/** Places that count as "like yours" for pooling: same archetype in the same city. */
const POOL_SHRINK = 3;

/**
 * Starting weights learned by places like this one (same archetype, same city), from their morning
 * taps only (owner overrides are one owner's judgement). Shrunk towards 1 when few places
 * contribute: m places give (m / (m + 3)) of their average lift. A new café in Indiranagar starts
 * where the other Indiranagar cafés have got to, instead of at 1.0.
 */
export async function pooledWeights(place: Pick<Place, "place_id" | "archetype" | "city">): Promise<Weights> {
  const { data: peers } = await db().from("places").select("place_id").eq("archetype", place.archetype).eq("city", place.city).neq("place_id", place.place_id);
  const ids = (peers ?? []).map((p: any) => p.place_id);
  if (!ids.length) return {};
  let { data, error } = await db().from("weights").select("place_id, signal_kind, w, owner_set").in("place_id", ids);
  if (error) return {};
  const by = new Map<string, number[]>();
  for (const r of data ?? []) {
    if (r.owner_set) continue;
    (by.get(r.signal_kind) ?? by.set(r.signal_kind, []).get(r.signal_kind)!).push(r.w);
  }
  const out: Weights = {};
  for (const [k, ws] of by) {
    const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
    out[k as SignalKind] = 1 + (mean - 1) * (ws.length / (ws.length + POOL_SHRINK));
  }
  return out;
}

/**
 * Pairs of (stored forecast, Google's live reading) for the last 60 days, for measuring the band.
 * Only forecasts that were stored before their day are used (the card for that date).
 */
async function calibrationFor(place: Place): Promise<{ band: number; n: number } | null> {
  const to = localDate(place.timezone);
  const from = addDays(to, -60);
  const [obs, { data: fcs }] = await Promise.all([
    observationsFor(place.place_id, from, to),
    db().from("forecasts").select("date, hourly").eq("place_id", place.place_id).gte("date", from).lte("date", to),
  ]);
  const byDate = new Map((fcs ?? []).map((r: any) => [r.date as string, (r.hourly?.hourly ?? []) as (number | null)[]]));
  const pairs: { live: number; forecast: number }[] = [];
  for (const o of obs) {
    const f = byDate.get(o.date)?.[o.hour];
    if (o.live !== null && typeof f === "number") pairs.push({ live: o.live, forecast: f });
  }
  return calibrateBand(pairs);
}

async function tapCount(place_id: string): Promise<number> {
  const { count } = await db()
    .from("taps")
    .select("*", { count: "exact", head: true })
    .eq("place_id", place_id);
  return count ?? 0;
}

/** City-level fetches are shared and cached; each failed source is skipped, never faked. */
export interface BuildOptions {
  /** Refetch news older than this many hours (default: the nightly 12 h). */
  newsMaxAgeHours?: number;
}

export async function gatherSignals(place: Place, targetDate: string, opts: BuildOptions = {}): Promise<{ signals: Signal[]; warnings: string[] }> {
  const fetchDate = localDate(place.timezone);
  const tomorrow = localDate(place.timezone, 1);
  const warnings: string[] = [];
  const signals: Signal[] = [];

  signals.push(...holidaySignals(place, targetDate));
  signals.push(...longWeekendSignals(place, targetDate));
  signals.push(...calendarSignals(place, targetDate, await measuredFor(place, targetDate, fetchDate, warnings)));
  signals.push(...paydaySignals(place, targetDate));
  signals.push(...examSignals(place, targetDate));

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
    const weather = await fetchWeather(place, fetchDate, tomorrow);
    signals.push(...rainSignals(weather, targetDate), ...heatSignals(place, weather, targetDate));
  } catch (e: any) {
    warnings.push(`weather: ${e.message}`);
  }

  try {
    signals.push(...airSignals(place, await fetchAir(place, fetchDate), targetDate));
  } catch (e: any) {
    warnings.push(`air: ${e.message}`);
  }

  try {
    signals.push(...competitorSignals(place, await fetchPeers(place, fetchDate), targetDate));
  } catch (e: any) {
    warnings.push(`nearby places: ${e.message}`);
  }

  // Review velocity, from our own review-count snapshots: free, and quiet until there are weeks of them.
  signals.push(...trendSignals(await observationsFor(place.place_id, addDays(fetchDate, -70), fetchDate), fetchDate));

  // Headlines are from the last 24 h, and hotel prices cost two searches: both for tomorrow only.
  if (targetDate === tomorrow) {
    try {
      signals.push(...hotelSignals(place, await fetchHotels(place, fetchDate, targetDate), targetDate));
    } catch (e: any) {
      warnings.push(`hotels: ${e.message}`);
    }
  }
  if (targetDate === tomorrow) {
    try {
      const rel = await classifyHeadlines(place, await fetchNews(place, fetchDate, opts.newsMaxAgeHours), new Date(), targetDate);
      signals.push(...disruptionSignals(rel));
    } catch (e: any) {
      warnings.push(`news: ${e.message}`);
    }
  }

  return { signals: applyDrinkingCulture(place, signals), warnings };
}

/** Google Trends interest for festivals on the date, where the place's state is known. Failures are skipped. */
async function measuredFor(place: Place, targetDate: string, fetchDate: string, warnings: string[]): Promise<MeasuredObservance> {
  const state = stateOf(place);
  const out: MeasuredObservance = {};
  if (!state) return out;
  for (const e of festivalsOn(targetDate)) {
    const term = trendsTerm(e as any);
    if (!term) continue;
    try {
      const m = measuredObservance(await fetchInterest(term, fetchDate), state);
      if (m) out[e.id] = m;
    } catch (e: any) {
      warnings.push(`trends: ${e.message}`);
    }
  }
  return out;
}

export interface Card {
  forecast: Forecast;
  copy: Copy;
  warnings: string[];
}

/** Build and store the evening card for one place and date. */
export async function buildCard(place: Place, targetDate: string, withCopy = true, opts: BuildOptions = {}): Promise<Card> {
  const [{ signals, warnings }, { weights: own, ownerSet }, pooled, taps, calibration] = await Promise.all([
    gatherSignals(place, targetDate, opts),
    loadWeightRows(place.place_id),
    pooledWeights(place).catch(() => ({}) as Weights),
    tapCount(place.place_id),
    calibrationFor(place).catch(() => null),
  ]);
  // The place's own weights win; kinds it has not learned yet start from places like it.
  const weights: Weights = { ...pooled, ...own };
  const today = localDate(place.timezone);
  const horizonDays = Math.max(1, Math.round((Date.parse(targetDate) - Date.parse(today)) / 864e5));

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
    horizonDays,
    calibration,
  });

  const copy = withCopy ? await writeCopy(f, place) : { headline: "", actions: ["", ""] as [string, string] };

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
