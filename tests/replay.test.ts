/**
 * Offline replay: the whole build pipeline (gatherSignals + forecast) for Third Wave Coffee, Church St,
 * for Saturday 10 Oct 2026, from the raw SerpApi responses saved in /fixtures. No network, no database,
 * no credits. A change to the model shows here as a changed card on a real day.
 */
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const load = (prefix: string) => {
  const f = readdirSync("fixtures").filter((x) => x.startsWith(prefix)).sort()[0]!;
  return JSON.parse(readFileSync(`fixtures/${f}`, "utf8"));
};

vi.mock("../lib/serp", () => ({
  forPlace: (_id: string, fn: () => Promise<unknown>) => fn(),
  serp: async (p: Record<string, any>) => {
    const q = String(p.q ?? "").toLowerCase();
    if (p.engine === "google_maps" && p.place_id) return load("google-maps-ChIJoVIBOaUXrjsRbF451NgeXrA-1791376121897");
    if (p.engine === "google_maps") return q === "cafe" ? load("google-maps-search-mall-1791376127033") : { local_results: [] };
    if (p.engine === "google" && q.includes("weather")) return load("google-weather-tomorrow-Bengaluru-1791376338563");
    if (p.engine === "google" && q.includes("events")) return load("google-events-this-week-bengaluru");
    if (p.engine === "google_sports") return load("google_sports-league-isl");
    if (p.engine === "google_news") return load("google-news-Bengaluru-road-closure-OR-strike-OR-bandh-1791376339436");
    if (p.engine === "google_hotels") return load("google-hotels-hotels-in-Bengaluru");
    if (p.engine === "google_trends") return load("google-trends-Navratri");
    throw new Error(`no fixture for ${JSON.stringify(p)}`);
  },
}));
vi.mock("../lib/cache", () => ({ cached: (_c: string, _d: string, _k: string, _a: number, fetcher: () => Promise<unknown>) => fetcher() }));
vi.mock("../lib/observe", () => ({ observationsFor: async () => [] }));
vi.mock("../lib/ownerEvents", async (orig) => ({ ...((await orig()) as object), ownerEvents: async () => [] }));

import { gatherSignals } from "../lib/build";
import { forecast } from "../lib/forecast";
import { curvesFromPopularTimes } from "../lib/place";
import type { Place } from "../lib/types";

const details = load("google-maps-ChIJoVIBOaUXrjsRbF451NgeXrA-1791376121897").place_results;
const stadium = load("google-maps-search-stadium-1791376123095").local_results.find((r: any) => r.title === "Sree Kanteerava Stadium");
const thirdWave: Place = {
  place_id: "ChIJoVIBOaUXrjsRbF451NgeXrA",
  name: "Third Wave Coffee",
  archetype: "cafe",
  area_type: "office",
  lat: details.gps_coordinates.latitude,
  lng: details.gps_coordinates.longitude,
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  timezone: "Asia/Kolkata",
  radius_km: 2,
  leagues: ["ISL"],
  baseline: curvesFromPopularTimes(details.popular_times)!,
  baseline_source: "own",
  anchors: [{ kind: "stadium", name: stadium.title, lat: stadium.gps_coordinates.latitude, lng: stadium.gps_coordinates.longitude }],
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T13:00:00Z")); // 6:30 pm in Bengaluru, when the nightly card is built
  process.env.LEAGUE_KGMIDS = "ISL:/m/0ynr_sq";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  vi.stubGlobal("fetch", async (url: string) => {
    if (String(url).includes("serpapi.com/locations")) return new Response(JSON.stringify([{ canonical_name: "Bengaluru,Karnataka,India", target_type: "City" }]));
    if (String(url).includes("air-quality")) return new Response(JSON.stringify(load("open-meteo-air-quality-delhi")));
    throw new Error(`offline: ${url}`);
  });
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("replay: Third Wave Coffee, Sat 10 Oct 2026 (Bengaluru FC v SC Delhi at Sree Kanteerava, 5 pm)", () => {
  it("finds the stadium match and makes the afternoon and evening busier", async () => {
    const { signals, warnings } = await gatherSignals(thirdWave, "2026-10-10");
    const match = signals.find((s) => s.kind === "match_stadium");
    expect(match?.label).toMatch(/Bengaluru/);
    expect(match?.distanceKm).toBeGreaterThan(1);
    expect(match?.distanceKm).toBeLessThan(2);
    expect(signals.some((s) => s.kind === "payday")).toBe(true);
    expect(warnings).toEqual([]);

    const f = forecast({ date: "2026-10-10", baseline: thirdWave.baseline, baselineSource: "own", archetype: "cafe", radiusKm: 2, signals, weights: {}, taps: 0 });
    expect(["busier", "much busier"]).toContain(f.buckets.evening);
    expect(["busier", "much busier"]).toContain(f.buckets.afternoon);
    expect(f.buckets.morning).toBe("usual");
  });

  it("returns pins in the same order however the fetches race", async () => {
    const a = (await gatherSignals(thirdWave, "2026-10-10")).signals.map((s) => s.kind);
    const b = (await gatherSignals(thirdWave, "2026-10-10")).signals.map((s) => s.kind);
    expect(a).toEqual(b);
  });
});
