import { serp } from "../serp";
import { cached } from "../cache";
import calendar from "../../config/india-calendar.json";

/** state name -> Google Trends interest (0..100, the top state = 100) over the last 12 months. */
export type InterestByState = Record<string, number>;

/** Trends names a few states differently from our addresses. */
const TRENDS_STATE: Record<string, string> = {
  "National Capital Territory of Delhi": "Delhi",
  "NCT of Delhi": "Delhi",
  Orissa: "Odisha",
  Pondicherry: "Puducherry",
};

/** Real shape: fixtures/google-trends-Navratri-*.json, interest_by_region[] = { location, extracted_value }. */
export function interestFrom(res: any): InterestByState {
  const out: InterestByState = {};
  for (const r of res?.interest_by_region ?? []) {
    if (typeof r?.extracted_value !== "number" || !r.location) continue;
    out[TRENDS_STATE[r.location] ?? r.location] = r.extracted_value;
  }
  return out;
}

/**
 * Measured observance: a state's search interest against the median state, clamped to 0.15..1.5.
 * "Durga Puja" searches in West Bengal run far above the median; in Kerala far below.
 */
export function measuredObservance(interest: InterestByState, state: string | null): { strength: number; value: number; median: number } | null {
  if (!state || interest[state] === undefined) return null;
  const vals = Object.values(interest).filter((v) => v > 0).sort((a, b) => a - b);
  if (vals.length < 5) return null;
  const median = vals[vals.length >> 1];
  if (!median) return null;
  const v = interest[state];
  return { strength: Math.max(0.15, Math.min(1.5, v / median)), value: v, median };
}

type CalEvent = (typeof calendar.events)[number] & { trends?: string | false };

/** The search term for a festival (the entry's `trends`, else its name). `false` turns it off. */
export function trendsTerm(e: CalEvent): string | null {
  if (e.trends === false) return null;
  return (e.trends as string | undefined) ?? e.name.replace(/\s*\(.*\)\s*/g, "").trim();
}

/**
 * One Google Trends call (engine=google_trends, data_type=GEO_MAP_0, geo=IN) per festival per month,
 * shared by every place in India.
 */
export async function fetchInterest(term: string, fetchDate: string): Promise<InterestByState> {
  return cached("india", `${fetchDate.slice(0, 7)}-01`, `trends:${term.toLowerCase()}`, 24 * 31, async () => {
    const res = await serp({ engine: "google_trends", q: term, geo: "IN", data_type: "GEO_MAP_0", date: "today 12-m" });
    const out = interestFrom(res);
    if (!Object.keys(out).length) throw new Error(`no Trends data for ${term}`);
    return out;
  });
}
