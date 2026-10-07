import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromAnswerBox } from "../lib/signals/weather";
import { matchSignals } from "../lib/signals/matches";
import { parseTimes } from "../lib/signals/events";
import type { Place } from "../lib/types";

// These load raw SerpApi responses saved under /fixtures (real calls, not synthetic data).
const load = (prefix: string) => {
  const f = readdirSync("fixtures").filter((x) => x.startsWith(prefix)).sort()[0]!;
  return JSON.parse(readFileSync(`fixtures/${f}`, "utf8"));
};

describe("weather answer box (real response)", () => {
  it("maps hourly_forecast weekday names to dates", () => {
    const res = load("google-weather-tomorrow-Bengaluru");
    const p = fromAnswerBox(res, "2026-10-07"); // fixture was captured on Wednesday 2026-10-07
    expect(p?.source).toBe("SerpApi answer box");
    expect(Object.keys(p!.days).length).toBeGreaterThanOrEqual(6);
    expect(p!.days["2026-10-07"]["17"].rain).toBe(15);
  });
});

describe("events (real response)", () => {
  it("has flat date and time strings that parseTimes understands", () => {
    const evs = load("google-events-this-week").events_results;
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) {
      expect(typeof e.date).toBe("string");
      expect(parseTimes(e.time)).not.toBeNull();
    }
    expect(parseTimes("3:00 PM")).toEqual([15, 18]);
  });
});

describe("matches (real league response)", () => {
  const games = load("google_sports-league-icc").league_results.game_groups.flatMap((g: any) => g.games);
  const ranchi = (name: string): Place =>
    ({ country: "India", city: "Ranchi", lat: 23.35, lng: 85.28, timezone: "Asia/Kolkata", radius_km: 5, anchors: [{ kind: "stadium", name, lat: 23.36, lng: 85.28 }] }) as Place;

  it("uses ISO start_time and converts to the place's timezone", () => {
    const sigs = matchSignals(ranchi("JSCA International Stadium Complex"), "2026-10-09", games);
    const ind = sigs.find((s) => s.label.startsWith("India"));
    expect(ind?.label).toBe("India vs West Indies 7 pm"); // 13:30Z = 19:00 IST
    expect(ind?.kind).toBe("match_stadium");
  });
  it("ignores TV matches where the home side is not playing", () => {
    const sigs = matchSignals(ranchi("Some Other Stadium"), "2026-10-08", games);
    expect(sigs).toEqual([]); // only Malaysian-hosted qualifiers that day
  });
  it("falls back to a TV match when no anchor matches the venue", () => {
    const sigs = matchSignals(ranchi("Some Other Stadium"), "2026-10-09", games);
    expect(sigs.find((s) => s.label.startsWith("India"))?.kind).toBe("match_tv");
  });
});

import { cityCountryFromAddress } from "../lib/place";
describe("cityCountryFromAddress (addresses from real Maps results)", () => {
  const c = (a: string) => cityCountryFromAddress(a).city;
  it("handles the layouts seen", () => {
    expect(c("Shop 52/2, Church St, Ashok Nagar, Bengaluru, Karnataka 560001, India")).toBe("Bengaluru");
    expect(c("2 Park St, London SE1 9AB, United Kingdom")).toBe("London");
    expect(c("1 Rue X, 75001 Paris, France")).toBe("Paris");
    expect(c("1 George St, Sydney NSW 2000, Australia")).toBe("Sydney");
    expect(c("10 Main St, Brooklyn, NY 11201, USA")).toBe("Brooklyn");
  });
});

import { classifyHeadlines, disruptionSize, disruptionSignals, isFresh, headlineAgeHours } from "../lib/signals/news";
describe("news disruptions (real google_news response)", () => {
  const items = load("google-news-Bengaluru").news_results.map((n: any) => ({ title: n.title, date: n.date }));
  const now = new Date("2026-10-07T13:00:00Z"); // when the fixture was captured
  it("keeps only headlines from the last 48 h", () => {
    const fresh = items.filter((h: any) => isFresh(h, now)).map((h: any) => h.title);
    expect(fresh).toContain("Bengaluru Race Course Road Closure Triggers Major Traffic Diversions");
    expect(fresh.some((t: string) => /Bandh today August 13/i.test(t))).toBe(false);
    expect(headlineAgeHours("garbage", now)).toBeNull();
  });
  it("sizes a neighbourhood disruption below a city-wide one", () => {
    expect(disruptionSize({ scope: "near" })).toBe(0.7);
    expect(disruptionSize({ scope: "city" })).toBe(1);
  });
  it("drops a road closure elsewhere in the city when no model is available", async () => {
    const place = { city: "Bengaluru", area: "Ashok Nagar", name: "x" };
    expect(await classifyHeadlines(place, items, now)).toEqual([]); // Race Course Road is not Ashok Nagar
  });
});

describe("ISL fixture (real response)", () => {
  const games = load("google_sports-league-isl").league_results.game_groups.flatMap((g: any) => g.games);
  const near = { country: "India", city: "Bengaluru", lat: 12.975, lng: 77.605, timezone: "Asia/Kolkata", radius_km: 2,
    anchors: [{ kind: "stadium", name: "Sree Kanteerava Stadium", lat: 12.9697, lng: 77.5935 }] } as Place;
  it("makes a stadium pin for a café 1.5 km away and a TV pin for one far away", () => {
    const a = matchSignals(near, "2026-10-10", games);
    expect(a.map((s) => s.kind)).toEqual(["match_stadium"]);
    expect(a[0].label).toBe("Bengaluru vs SC Delhi 5 pm");
    const far = { ...near, anchors: [] } as Place;
    expect(matchSignals(far, "2026-10-10", games).map((s) => s.kind)).toEqual(["match_tv"]);
  });
});

import { guessArchetype } from "../lib/place";
describe("guessArchetype (type strings from real Maps results)", () => {
  it("reads the primary type first", () => {
    const f = (n: string) => load(n).place_results.type as string[];
    expect(guessArchetype(f("google-maps-ChIJoVIBOaUXrjsR"))).toBe("cafe"); // Cafe, Coffee roastery, ...
    expect(guessArchetype(["Coffee shop", "Barista training"])).toBe("cafe");
    expect(guessArchetype(["Sports bar", "Restaurant"])).toBe("bar");
    expect(guessArchetype(["Bakery"])).toBe("cafe");
  });
});

describe("Connaught Place protests (real google_news response, 2 Oct 7 2026)", () => {
  const items = load("google_news-connaught-place").news_results.map((n: any) => ({ title: n.title, date: n.date, source: n.source?.name }));
  const now = new Date("2026-10-07T13:30:00Z");
  const place = { city: "New Delhi", area: "Connaught Place", name: "Xero Degrees" };
  it("finds protest and traffic-curb headlines that name the area", async () => {
    const hits = await classifyHeadlines(place, items, now);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.scope === "near")).toBe(true);
    expect(hits.some((h) => /Connaught Place/i.test(h.title))).toBe(true);
    const [pin] = disruptionSignals(hits);
    expect(pin.size).toBe(0.7);
    expect(pin.label).toBe("Disruption near you");
  });
  it("finds nothing for a neighbourhood that is not named", async () => {
    const hits = await classifyHeadlines({ ...place, area: "Hauz Khas" }, items, now);
    expect(hits).toEqual([]);
  });
});
