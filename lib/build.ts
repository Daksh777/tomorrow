import { db } from "./db";
import { forPlace } from "./serp";
import { calibrateBand, forecast, type Weights } from "./forecast";
import { ruleCopy, writeCopy } from "./copy";
import { LANGUAGES } from "./languages";
import { addDays, localDate, weekdayOf } from "./time";
import { correctedCurve, usualCorrection } from "./correction";
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
import { ownerEventSignals, ownerEvents } from "./ownerEvents";
import { applyDrinkingCulture, calendarSignals, examSignals, festivalsOn, paydaySignals, stateOf, type MeasuredObservance } from "./india";
import type { Copy, Forecast, Observation, Pin, Place, Signal, SignalKind } from "./types";

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
  // One round trip: weights joined to their place, filtered on the place's archetype and city.
  const { data, error } = await db()
    .from("weights")
    .select("signal_kind, w, owner_set, places!inner(archetype, city)")
    .eq("places.archetype", place.archetype)
    .eq("places.city", place.city)
    .neq("place_id", place.place_id);
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

async function tapCount(place_id: string): Promise<number> {
  const { count } = await db()
    .from("taps")
    .select("*", { count: "exact", head: true })
    .eq("place_id", place_id);
  return count ?? 0;
}

/** The last 60 days of stored cards and Google live readings: what calibration and correction learn from. */
export async function liveHistory(place: Place): Promise<{ obs: Observation[]; cards: { date: string; hourly: (number | null)[]; pins: Pin[] }[] }> {
  const to = localDate(place.timezone);
  const from = addDays(to, -60);
  const [obs, { data }] = await Promise.all([
    observationsFor(place.place_id, from, to),
    db().from("forecasts").select("date, hourly, pins").eq("place_id", place.place_id).gte("date", from).lte("date", to),
  ]);
  return { obs, cards: (data ?? []).map((r: any) => ({ date: r.date, hourly: r.hourly?.hourly ?? [], pins: (r.pins ?? []) as Pin[] })) };
}

/** Pairs of (stored forecast, live reading) for measuring the band. */
function calibrationFrom(h: Awaited<ReturnType<typeof liveHistory>>): { band: number; n: number } | null {
  const byDate = new Map(h.cards.map((c) => [c.date, c.hourly]));
  const pairs: { live: number; forecast: number }[] = [];
  for (const o of h.obs) {
    const f = byDate.get(o.date)?.[o.hour];
    if (o.live !== null && typeof f === "number") pairs.push({ live: o.live, forecast: f });
  }
  return calibrateBand(pairs);
}

/** City-level fetches are shared and cached; each failed source is skipped, never faked. */
export interface BuildOptions {
  /** Refetch news older than this many hours (default: the nightly 12 h). */
  newsMaxAgeHours?: number;
  /** Store the phrasebook draft without asking the model (past days, whose words nobody reads). */
  draftCopy?: boolean;
}

export async function gatherSignals(place: Place, targetDate: string, opts: BuildOptions = {}): Promise<{ signals: Signal[]; warnings: string[] }> {
  const fetchDate = localDate(place.timezone);
  const tomorrow = localDate(place.timezone, 1);
  const warnings: string[] = [];

  // Every source runs at once; a failed one adds a warning and is skipped, never faked.
  // Results are flattened in this fixed order, so pins come out the same however the fetches race.
  const task = (name: string, run: () => Promise<Signal[]> | Signal[]) => async (): Promise<Signal[]> => {
    try {
      return await run();
    } catch (e: any) {
      warnings.push(`${name}: ${e.message}`);
      return [];
    }
  };
  const tasks = [
    task("calendar", () => [...holidaySignals(place, targetDate), ...longWeekendSignals(place, targetDate)]),
    task("festivals", async () => calendarSignals(place, targetDate, await measuredFor(place, targetDate, fetchDate, warnings))),
    task("calendar", () => [...paydaySignals(place, targetDate), ...examSignals(place, targetDate)]),
    task("your plans", async () => ownerEventSignals(await ownerEvents(place.place_id), targetDate)),
    task("events", async () => eventSignals(place, fetchDate, targetDate, await fetchEvents(place, fetchDate))),
    ...place.leagues.map((league) => task(`matches(${league})`, async () => matchSignals(place, targetDate, await fetchMatches(place.city, league, fetchDate)))),
    task("weather", async () => {
      const weather = await fetchWeather(place, fetchDate, tomorrow);
      return [...rainSignals(weather, targetDate, place.archetype), ...heatSignals(place, weather, targetDate)];
    }),
    task("air", async () => airSignals(place, await fetchAir(place, fetchDate), targetDate)),
    task("nearby places", async () => competitorSignals(place, await fetchPeers(place, fetchDate), targetDate)),
    // Review velocity, from our own review-count snapshots: free, and quiet until there are weeks of them.
    task("reviews", async () => trendSignals(await observationsFor(place.place_id, addDays(fetchDate, -70), fetchDate), fetchDate)),
    // Headlines are from the last 24 h, and hotel prices cost two searches: both for tomorrow only.
    ...(targetDate === tomorrow
      ? [
          task("hotels", async () => hotelSignals(place, await fetchHotels(place, fetchDate, targetDate), targetDate)),
          task("news", async () => disruptionSignals(await classifyHeadlines(place, await fetchNews(place, fetchDate, opts.newsMaxAgeHours), new Date(), targetDate))),
        ]
      : []),
  ];
  const signals = (await Promise.all(tasks.map((t) => t()))).flat();
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
  return forPlace(place.place_id, () => build(place, targetDate, withCopy, opts));
}

async function build(place: Place, targetDate: string, withCopy: boolean, opts: BuildOptions): Promise<Card> {
  const [{ signals, warnings }, { weights: own, ownerSet }, pooled, taps, history] = await Promise.all([
    gatherSignals(place, targetDate, opts),
    loadWeightRows(place.place_id),
    pooledWeights(place).catch(() => ({}) as Weights),
    tapCount(place.place_id),
    liveHistory(place).catch(() => ({ obs: [], cards: [] })),
  ]);
  const calibration = calibrationFrom(history);
  // Google's usual curve, corrected by how this place has actually run against it.
  const weekday = weekdayOf(targetDate);
  const correction = usualCorrection(history.obs, Object.fromEntries(history.cards.map((c: { date: string; pins: Pin[] }) => [c.date, c.pins])), weekday);
  const baseline = { ...place.baseline, [weekday]: correctedCurve(place.baseline[weekday], correction) };
  // The place's own weights win; kinds it has not learned yet start from places like it.
  const weights: Weights = { ...pooled, ...own };
  const today = localDate(place.timezone);
  const horizonDays = Math.max(1, Math.round((Date.parse(targetDate) - Date.parse(today)) / 864e5));

  const f = forecast({
    date: targetDate,
    baseline,
    baselineSource: place.baseline_source,
    correction,
    archetype: place.archetype,
    radiusKm: place.radius_km,
    signals,
    weights,
    ownerSet,
    taps,
    horizonDays,
    calibration,
  });

  const lang = place.language && place.language in LANGUAGES ? place.language : "en";
  const copy = withCopy ? (opts.draftCopy ? ruleCopy(f, place.name, place, lang) : await writeCopy(f, place)) : { headline: "", actions: ["", ""] as [string, string] };

  if (withCopy) {
    await db().from("forecasts").upsert({
      place_id: place.place_id,
      date: targetDate,
      hourly: { hourly: f.hourly, lo: f.lo, hi: f.hi, baseline: f.baseline },
      buckets: { buckets: f.buckets, ratios: f.ratios, taps: f.taps, tuned: f.tuned, baselineSource: f.baselineSource, correction: f.correction },
      pins: f.pins,
      copy,
      band: f.band,
    });
  }
  return { forecast: f, copy, warnings };
}
