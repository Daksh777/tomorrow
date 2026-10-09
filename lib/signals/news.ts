import { serp } from "../serp";
import { cached } from "../cache";
import { db } from "../db";
import { complete } from "../llm";
import type { Place, Signal, SourceLink } from "../types";

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

/** Nightly builds reuse news up to 12 h old; "Check news again" passes a shorter age (its cooldown). */
export const NEWS_MAX_AGE_HOURS = 12;
export const NEWS_RECHECK_HOURS = 0.25;

export async function fetchNews(place: Place, fetchDate: string, maxAgeHours = NEWS_MAX_AGE_HOURS): Promise<Headline[]> {
  const run = (kind: string, q: string) =>
    cached<Headline[]>(place.city, fetchDate, kind, maxAgeHours, async () => {
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

/** When this city's news was last fetched, as an ISO timestamp, or null. */
export async function newsCheckedAt(city: string): Promise<string | null> {
  const { data } = await db()
    .from("signal_cache")
    .select("fetched_at")
    .eq("city", city)
    .eq("kind", "news:city")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.fetched_at ?? null;
}

const KEYWORDS =
  /\b(bandh|strike|road closure|closures?|roads? closed|curfew|shutdown|diversions?|blockade|protests?|curbs|restrictions|advisory|barricad\w*|march|rally|jam|shuts?)\b/i;
/** City-wide events keep the full effect. */
const CITYWIDE = /\b(bandh|strike|curfew|shutdown)\b/i;
/** A gathering that snarls traffic around it, wherever in the city it is. */
const GATHERING = /\b(protests?|march|rally|agitation|stir|dharna|sit-in|procession)\b/i;
const NEAR_SIZE = 0.7;
/** A protest somewhere in the city whose place the headline does not give: smaller than one near you. */
const ELSEWHERE_SIZE = 0.35;
const MAX_AGE_HOURS = 48;

/** google_news dates look like "10/06/2026, 03:36 PM, +0000 UTC". Epoch ms, or null. */
function headlineTime(date: string | undefined): number | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(date ?? "");
  if (!m) return null;
  const h = (Number(m[4]) % 12) + (m[6].toUpperCase() === "PM" ? 12 : 0);
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]));
}

export function headlineAgeHours(date: string | undefined, now: Date): number | null {
  const t = headlineTime(date);
  return t === null ? null : (now.getTime() - t) / 3600000;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/**
 * The day a headline says its event happens, or null when it names none. Read from the title, relative to
 * when it was published (in the place's timezone): "August 13" or "13 Aug", then "today"/"tomorrow", then
 * a weekday ("on Thursday"). Stories are often republished, so "Karnataka Bandh Tomorrow, August 13" can
 * carry an October date; this is what keeps it off an October card.
 */
export function statedDate(h: Headline, timeZone = "UTC"): string | null {
  const t = headlineTime(h.date);
  if (t === null) return null;
  const pub = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  const title = h.title.toLowerCase();

  const md = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(title);
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`).exec(title);
  const hit = md ? { mon: md[1], day: Number(md[2]) } : dm ? { mon: dm[2], day: Number(dm[1]) } : null;
  if (hit && hit.day >= 1 && hit.day <= 31) {
    const m = MONTHS.indexOf(hit.mon.slice(0, 3));
    let y = Number(pub.slice(0, 4));
    // A date more than six months before publishing is next year's ("Jan 3" in a December story).
    if (Date.parse(`${iso(y, m, hit.day)}T00:00:00Z`) < Date.parse(`${pub}T00:00:00Z`) - 182 * 864e5) y += 1;
    return iso(y, m, hit.day);
  }
  if (/\btomorrow\b/.test(title)) return addDays(pub, 1);
  if (/\b(today|tonight)\b/.test(title)) return pub;
  const wd = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(title));
  if (wd >= 0) {
    const from = new Date(`${pub}T00:00:00Z`).getUTCDay();
    return addDays(pub, (wd - from + 7) % 7);
  }
  return null;
}

/** Undated or stale headlines are dropped: a July bandh says nothing about tomorrow. */
export function isFresh(h: Headline, now = new Date()): boolean {
  const age = headlineAgeHours(h.date, now);
  return age !== null && age <= MAX_AGE_HOURS;
}

export type Scope = "near" | "city" | "elsewhere";
export interface Classified extends Headline {
  scope: Scope;
  /** Local clock hours when the headline states them; otherwise the whole open day. */
  hours?: [number, number];
}

const mentions = (title: string, area?: string | null) => !!area && title.toLowerCase().includes(area.toLowerCase());

/**
 * Keep fresh, on-topic headlines and say how close they are. The model only judges relevance to this
 * neighbourhood; it never invents a headline. A headline that names a day other than `tomorrow` is dropped
 * before anything else. Without a model: naming the area is "near", a strike/bandh/curfew is "city", a
 * protest or rally the headline dates to `tomorrow` is "elsewhere", and anything else is dropped.
 */
export async function classifyHeadlines(
  place: Pick<Place, "city" | "area" | "name"> & { timezone?: string },
  items: Headline[],
  now = new Date(),
  tomorrow?: string,
): Promise<Classified[]> {
  const tz = place.timezone ?? "UTC";
  const dated = items
    .filter((h) => isFresh(h, now) && KEYWORDS.test(h.title))
    .map((h) => ({ h, on: statedDate(h, tz) }))
    .filter((x) => !tomorrow || !x.on || x.on === tomorrow)
    .slice(0, 25);
  const pre = dated.map((x) => x.h);
  if (!pre.length) return [];
  const onTomorrow = (i: number) => !!tomorrow && dated[i].on === tomorrow;
  const byRules = (): Classified[] =>
    pre.flatMap((h, i): Classified[] =>
      mentions(h.title, place.area)
        ? [{ ...h, scope: "near" }]
        : CITYWIDE.test(h.title)
          ? [{ ...h, scope: "city" }]
          : onTomorrow(i) && GATHERING.test(h.title)
            ? [{ ...h, scope: "elsewhere" }]
            : [],
    );
  try {
    const where = place.area ? `${place.area}, ${place.city}` : place.city;
    const when = tomorrow ? ` Only count a disruption if it applies on ${tomorrow}; anything on another date must be excluded.` : "";
    const text = await complete(
      "You classify news headlines for a small business. Reply with JSON only.",
      `The business is in ${where}. For each headline say whether it describes a protest, march, strike, bandh, ` +
        `road closure or traffic restriction that is happening today or tomorrow.${when} Reply with JSON ` +
        `{"near":[...],"city":[...],"elsewhere":[...]}. "near": it would affect foot traffic within about 3 km of ` +
        `${where} (use what you know of ${place.city}'s geography for the venue). "city": a city-wide strike, bandh ` +
        `or curfew in ${place.city}. "elsewhere": a protest, march or rally in ${place.city} whose venue the headline ` +
        `does not give; leave it out if the venue is given and farther than 3 km. Each entry is either an index, or ` +
        `{"i":index,"from":h,"to":h} when the headline states the hours (24-hour clock). Several headlines about the ` +
        `same event may all be listed. Ignore old news and anything not about disruption.\n` +
        pre.map((h, i) => `${i}. ${h.title} (published ${h.date ?? "no date"}${dated[i].on ? `; event on ${dated[i].on}` : ""})`).join("\n"),
      400,
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
    return [...pick(j.near, "near"), ...demoted, ...real, ...pick(j.elsewhere, "elsewhere")];
  } catch {
    return byRules();
  }
}

export function disruptionSize(c: { scope: Scope }): number {
  return c.scope === "city" ? 1 : c.scope === "near" ? NEAR_SIZE : ELSEWHERE_SIZE;
}

const SCOPE_LABEL: Record<Scope, string> = {
  near: "Disruption near you",
  city: "City-wide disruption",
  elsewhere: "Protest in the city",
};

const MAX_LINKS = 3;

/** Up to three articles of the winning scope, best first, http(s) only and one per outlet. */
function sourceLinks(best: Classified, relevant: Classified[]): SourceLink[] {
  const out: SourceLink[] = [];
  const outlets = new Set<string>();
  for (const h of [best, ...relevant.filter((r) => r !== best && r.scope === best.scope)]) {
    if (!h.link || !/^https?:\/\//i.test(h.link)) continue;
    const outlet = (h.source ?? h.link).toLowerCase();
    if (outlets.has(outlet)) continue;
    outlets.add(outlet);
    out.push({ title: h.title, url: h.link, ...(h.source ? { source: h.source } : {}) });
    if (out.length === MAX_LINKS) break;
  }
  return out;
}

/** One disruption pin for the open day (8 am to 10 pm), the strongest one. Only applied to the next day. */
export function disruptionSignals(relevant: Classified[]): Signal[] {
  const best = [...relevant].sort((a, b) => disruptionSize(b) - disruptionSize(a))[0];
  if (!best) return [];
  const links = sourceLinks(best, relevant);
  return [
    {
      kind: "disruption" as const,
      label: SCOPE_LABEL[best.scope],
      source: best.source ? `Google News · ${best.source}` : "Google News",
      detail: best.title,
      distanceKm: null,
      startHour: best.hours ? best.hours[0] : 8,
      endHour: best.hours ? best.hours[1] : 22,
      size: disruptionSize(best),
      ...(links.length ? { links } : {}),
    },
  ];
}
