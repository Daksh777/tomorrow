import { serp } from "../serp";
import { cached } from "../cache";
import { haversineKm } from "../geo";
import { fmtHour } from "../time";
import type { Place, Signal } from "../types";
import config from "../../config/effects.json";

export function leagueIds(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (process.env.LEAGUE_KGMIDS ?? "").split(",")) {
    const [name, id] = part.split(":").map((s) => s.trim());
    if (name && id) out[name] = id;
  }
  return out;
}

/**
 * Matches: engine=google_sports, type=league, tab=gm, sp=cr|ft, kgmid=<league>,
 * moa/mob = window. One call per league per day, covering the next 7 days.
 */
export async function fetchMatches(
  city: string,
  league: string,
  fetchDate: string,
): Promise<any[]> {
  const kgmid = leagueIds()[league];
  if (!kgmid) return [];
  return cached(city, fetchDate, `matches:${league}`, 24, async () => {
    const start = new Date(`${fetchDate}T00:00:00Z`);
    // sp=cr and sp=ft each come back "fully empty" for some leagues (ISL: cr only; ICC: either), so try both.
    let res: any = {};
    for (const sp of ["cr", "ft"]) {
      try {
        res = await serp({
          engine: "google_sports",
          type: "league",
          tab: "gm",
          sp,
          kgmid,
          moa: start.toISOString().replace(".000", ""), // API requires ISO8601 UTC, not epoch
          mob: new Date(start.getTime() + 8 * 86400000).toISOString().replace(".000", ""),
        });
      } catch {
        continue;
      }
      if (res.league_results?.game_groups?.length) break;
    }
    const groups: any[] = res.league_results?.game_groups ?? [];
    return groups.flatMap((g) => g.games ?? []);
  });
}

/** start_time may be ISO, epoch seconds, or "date + time" strings depending on the response. */
function gameStart(g: any): Date | null {
  const raw = g.start_time ?? g.date_time;
  if (typeof raw === "number") return new Date(raw * 1000);
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function localParts(d: Date, tz: string): { date: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: (Number(get("hour")) % 24) + Number(get("minute")) / 60,
  };
}

/**
 * Does a side in this match belong to the place: its country (India), city (Delhi Capitals for New Delhi)
 * or state (Punjab Kings, Gujarat Titans)? Whole words on full team names, so "Mumbai Indians" is not India.
 */
function isHomeSide(place: Place, teams: any[]): boolean {
  const names = teams.flatMap((t) => [t.name, t.short_name]).filter(Boolean).map((n) => String(n).toLowerCase());
  const home = [place.country, place.state, ...String(place.city ?? "").split(/\s+/)]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
    .filter((x) => x.length > 3);
  const word = (h: string) => new RegExp(`(^|[^a-z])${h.replace(/[^a-z ]/g, "")}([^a-z]|$)`);
  return names.some((n) => home.some((h) => word(h).test(n)));
}

export function matchSignals(place: Place, targetDate: string, games: any[]): Signal[] {
  const w = config.windows;
  const out: Signal[] = [];

  for (const g of games) {
    const start = gameStart(g);
    if (!start) continue;
    const lp = localParts(start, place.timezone);
    if (lp.date !== targetDate) continue;

    const teams = (g.teams ?? []).map((t: any) => t.short_name ?? t.name).filter(Boolean);
    const title = teams.length >= 2 ? `${teams[0]} vs ${teams[1]}` : (g.title ?? "Match");
    const label = `${title} ${fmtHour(lp.hour)}`;

    // Is the venue close enough to count as "at a stadium within radius"?
    let d: number | null = null;
    const loc = g.venue?.location; // real responses give a city string here, not coordinates
    if (loc?.latitude != null && loc?.longitude != null) {
      d = haversineKm(place, { lat: loc.latitude, lng: loc.longitude });
    } else if (g.venue?.name) {
      const vn = String(g.venue.name).toLowerCase();
      const a = place.anchors.find(
        (x) => x.kind === "stadium" && (x.name.toLowerCase().includes(vn) || vn.includes(x.name.toLowerCase())),
      );
      if (a) d = haversineKm(place, a);
    }

    const playEnd = lp.hour + w.match_duration_hours;
    if (d !== null && d <= Math.min(w.match_stadium_radius_km, place.radius_km)) {
      out.push({
        kind: "match_stadium",
        label,
        source: "Google Sports",
        detail: g.venue?.name,
        distanceKm: d,
        startHour: lp.hour - w.match_stadium_hours_before,
        endHour: playEnd + w.match_stadium_hours_after,
        size: 1,
      });
    } else {
      // A TV match only pulls people in when the home side plays (country or city in a team name);
      // qualifiers between unrelated teams in another country move nothing.
      if (!isHomeSide(place, g.teams ?? [])) continue;
      out.push({
        kind: "match_tv",
        label,
        source: "Google Sports",
        detail: g.venue?.name ? `at ${g.venue.name}` : undefined,
        distanceKm: null,
        startHour: lp.hour,
        endHour: playEnd,
        size: 1,
      });
    }
  }
  return out;
}
