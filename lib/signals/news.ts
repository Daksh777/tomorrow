import { serp } from "../serp";
import { cached } from "../cache";
import { complete } from "../llm";
import type { Place, Signal } from "../types";

export interface Headline {
  title: string;
  source?: string;
  date?: string;
  link?: string;
}

/**
 * Disruptions: engine=google_news. `when:2d` keeps it to the last two days (a bare query returns weeks-old
 * stories), and `q` cannot be combined with `so`. One query for the city, one for the neighbourhood,
 * because "New Delhi" alone buries a protest at Jantar Mantar under city-wide traffic stories.
 */
const TOPICS = "protest OR strike OR bandh OR closure OR curbs OR diversion OR advisory";

export async function fetchNews(place: Place, fetchDate: string): Promise<Headline[]> {
  const run = (kind: string, q: string) =>
    cached<Headline[]>(place.city, fetchDate, kind, 12, async () => {
      const res = await serp({ engine: "google_news", q, gl: "in", hl: "en" });
      return (res.news_results ?? []).slice(0, 25).map((n: any) => ({
        title: n.title,
        source: n.source?.name ?? n.source,
        date: n.date,
        link: n.link,
      }));
    });

  const area = place.area?.trim();
  const lists = await Promise.all([
    run("news:city", `${place.city} ${TOPICS} when:2d`),
    ...(area ? [run(`news:${area.toLowerCase()}`, `${area} ${place.city} ${TOPICS} when:2d`)] : []),
  ]);
  const seen = new Set<string>();
  return lists.flat().filter((h) => (seen.has(h.title) ? false : (seen.add(h.title), true)));
}

const KEYWORDS =
  /\b(bandh|strike|road closure|closures?|roads? closed|curfew|shutdown|diversions?|blockade|protests?|curbs|restrictions|advisory|barricad\w*|march|rally|jam|shuts?)\b/i;
/** City-wide events keep the full effect. */
const CITYWIDE = /\b(bandh|strike|curfew|shutdown)\b/i;
const NEAR_SIZE = 0.7;
const MAX_AGE_HOURS = 48;

/** google_news dates look like "10/06/2026, 03:36 PM, +0000 UTC". */
export function headlineAgeHours(date: string | undefined, now: Date): number | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(date ?? "");
  if (!m) return null;
  const h = (Number(m[4]) % 12) + (m[6].toUpperCase() === "PM" ? 12 : 0);
  const t = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]));
  return (now.getTime() - t) / 3600000;
}

/** Undated or stale headlines are dropped: a July bandh says nothing about tomorrow. */
export function isFresh(h: Headline, now = new Date()): boolean {
  const age = headlineAgeHours(h.date, now);
  return age !== null && age <= MAX_AGE_HOURS;
}

export type Scope = "near" | "city";
export interface Classified extends Headline {
  scope: Scope;
  /** Local clock hours when the headline states them; otherwise the whole open day. */
  hours?: [number, number];
}

const mentions = (title: string, area?: string | null) => !!area && title.toLowerCase().includes(area.toLowerCase());

/**
 * Keep fresh, on-topic headlines and say how close they are. The model only judges relevance to this
 * neighbourhood; it never invents a headline. Without a model: naming the area is "near", a
 * strike/bandh/curfew is "city", and anything else (a closure somewhere else in the city) is dropped.
 */
export async function classifyHeadlines(place: Pick<Place, "city" | "area" | "name">, items: Headline[], now = new Date(), tomorrow?: string): Promise<Classified[]> {
  const pre = items.filter((h) => isFresh(h, now) && KEYWORDS.test(h.title)).slice(0, 25);
  if (!pre.length) return [];
  const byRules = (): Classified[] =>
    pre.flatMap((h): Classified[] =>
      mentions(h.title, place.area) ? [{ ...h, scope: "near" }] : CITYWIDE.test(h.title) ? [{ ...h, scope: "city" }] : [],
    );
  try {
    const where = place.area ? `${place.area}, ${place.city}` : place.city;
    const when = tomorrow ? ` Only count a disruption if it applies on ${tomorrow}; a protest or closure planned for a later date must be excluded.` : "";
    const text = await complete(
      "You classify news headlines for a small business. Reply with JSON only.",
      `The business is in ${where}. For each headline say whether it describes a protest, march, strike, bandh, ` +
        `road closure or traffic restriction that is happening today or tomorrow AND would affect foot traffic within ` +
        `about 3 km of ${where}.${when} Reply {"near":[...]} for those, and {"city":[...]} for city-wide strikes, ` +
        `bandhs or curfews anywhere in ${place.city}. Each entry is either an index, or {"i":index,"from":h,"to":h} ` +
        `when the headline states the hours (24-hour clock). Ignore old news, events elsewhere in the city, and ` +
        `anything not about disruption.\n` +
        pre.map((h, i) => `${i}. ${h.title} (${h.date ?? "no date"})`).join("\n"),
      300,
    );
    if (!text) return byRules();
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const pick = (ix: unknown, scope: Scope): Classified[] =>
      (Array.isArray(ix) ? ix : []).flatMap((e: any): Classified[] => {
        const i = typeof e === "number" ? e : e?.i;
        const h = pre[i];
        if (!h) return [];
        const from = Number(e?.from);
        const to = Number(e?.to);
        const ok = Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from && to <= 28;
        return [{ ...h, scope, ...(ok ? { hours: [from, to] as [number, number] } : {}) }];
      });
    // The model may only call something city-wide if the headline says strike, bandh, curfew or shutdown.
    const city = pick(j.city, "city");
    const real = city.filter((h) => CITYWIDE.test(h.title));
    const demoted = city.filter((h) => !CITYWIDE.test(h.title)).map((h): Classified => ({ ...h, scope: "near" }));
    return [...pick(j.near, "near"), ...demoted, ...real];
  } catch {
    return byRules();
  }
}

export function disruptionSize(c: { scope: Scope }): number {
  return c.scope === "city" ? 1 : NEAR_SIZE;
}

/** One disruption pin for the open day (8 am to 10 pm), the strongest one. Only applied to the next day. */
export function disruptionSignals(relevant: Classified[]): Signal[] {
  const best = [...relevant].sort((a, b) => disruptionSize(b) - disruptionSize(a))[0];
  if (!best) return [];
  return [
    {
      kind: "disruption" as const,
      label: best.scope === "near" ? "Disruption near you" : "City-wide disruption",
      source: best.source ? `Google News · ${best.source}` : "Google News",
      detail: best.title,
      distanceKm: null,
      startHour: best.hours ? best.hours[0] : 8,
      endHour: best.hours ? best.hours[1] : 22,
      size: disruptionSize(best),
    },
  ];
}
