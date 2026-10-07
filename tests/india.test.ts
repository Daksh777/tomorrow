import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendarHoliday, calendarSignals, paydaySignals, stateOf } from "../lib/india";
import { aqiCategory, airSignals, type AirPayload } from "../lib/signals/air";
import { holidaySignals, longWeekendSignals } from "../lib/signals/holidays";
import { forecast } from "../lib/forecast";
import { WEEKDAYS, type Baseline, type Place, type Signal } from "../lib/types";

const mk = (o: Partial<Place>): Place =>
  ({ place_id: "t", name: "t", archetype: "cafe", area_type: "office", lat: 28.63, lng: 77.22, city: "New Delhi", country: "India",
     timezone: "Asia/Kolkata", radius_km: 2, leagues: [], baseline_source: "own", anchors: [], ...o }) as Place;

describe("state lookup", () => {
  it("uses the address state, then the city table, and nothing abroad", () => {
    expect(stateOf(mk({ state: "West Bengal", city: "Howrah" }))).toBe("West Bengal");
    expect(stateOf(mk({ city: "Bengaluru" }))).toBe("Karnataka");
    expect(stateOf(mk({ country: "United Kingdom", city: "London" }))).toBeNull();
  });
});

describe("festival calendar", () => {
  const eff = (p: Place, d: string, kind = "festival") => calendarSignals(p, d).filter((s) => s.kind === kind).map((s) => [s.label, s.effectOverride]);
  it("Navratri lifts restaurants and cuts bars (alcohol avoided)", () => {
    expect(eff(mk({ archetype: "restaurant" }), "2026-10-11")).toEqual([["Navratri", 0.1]]);
    expect(eff(mk({ archetype: "bar" }), "2026-10-11")).toEqual([["Navratri", -0.2]]);
  });
  it("regional festivals only fire in their region", () => {
    const kolkata = mk({ archetype: "restaurant", city: "Kolkata", state: "West Bengal" });
    expect(eff(kolkata, "2026-10-18").map((x) => x[0])).toContain("Durga Puja");
    expect(eff(mk({ archetype: "restaurant", city: "Chennai" }), "2026-10-18").map((x) => x[0])).not.toContain("Durga Puja");
    expect(eff(mk({ archetype: "salon", city: "Delhi" }), "2026-10-29").map((x) => x[0])).toContain("Karva Chauth grooming");
    expect(eff(mk({ archetype: "salon", city: "Chennai" }), "2026-10-29")).toEqual([]);
  });
  it("Diwali night keeps people home", () => {
    expect(eff(mk({ archetype: "restaurant" }), "2026-11-08")[0][1]).toBeLessThan(0);
  });
  it("dry days hit bars hardest and leave cafes alone", () => {
    expect(eff(mk({ archetype: "bar" }), "2026-10-02", "dry_day")[0][1]).toBe(-0.6);
    expect(eff(mk({ archetype: "cafe" }), "2026-10-02", "dry_day")).toEqual([]);
  });
  it("nothing outside India", () => {
    expect(calendarSignals(mk({ country: "United Kingdom", archetype: "bar" }), "2026-12-31")).toEqual([]);
  });
  it("fills the holidays date-holidays lacks (Dussehra, Christmas) for office areas", () => {
    expect(calendarHoliday("2026-10-20")).toBe("Dussehra");
    const s = holidaySignals(mk({ area_type: "office" }), "2026-10-20");
    expect(s).toHaveLength(1);
    expect(s[0].effectOverride).toBe(-0.3);
    expect(holidaySignals(mk({}), "2026-10-14")).toEqual([]);
  });
});

describe("payday", () => {
  const eff = (p: Place, d: string) => paydaySignals(p, d)[0]?.effectOverride;
  const rest = mk({ archetype: "restaurant", area_type: "office" });
  it("full effect on days 1-3, half on 4-7, none mid-month", () => {
    expect(eff(rest, "2026-11-02")).toBeCloseTo(0.1, 5); // a Monday
    expect(eff(rest, "2026-11-05")).toBeCloseTo(0.05, 5); // a Thursday
    expect(eff(rest, "2026-11-17")).toBeUndefined();
  });
  it("boosts the first weekends and tightens at month-end", () => {
    expect(eff(rest, "2026-11-07")).toBeCloseTo(0.1 * 0.5 * 1.25, 5); // Saturday
    expect(eff(rest, "2026-11-28")).toBeLessThan(0);
  });
  it("office areas respond more than residential ones", () => {
    expect(eff(mk({ archetype: "restaurant", area_type: "residential" }), "2026-11-02")!).toBeCloseTo(0.07, 5);
  });
});

describe("air quality (real Open-Meteo response for Delhi)", () => {
  it("uses CPCB PM2.5 categories", () => {
    expect(aqiCategory(60)).toBeNull();
    expect(aqiCategory(100)?.name).toBe("poor");
    expect(aqiCategory(150)?.name).toBe("very poor");
    expect(aqiCategory(336)?.name).toBe("severe");
  });
  it("parses hourly PM2.5 and flips sign for delivery kitchens", () => {
    const j = JSON.parse(readFileSync("fixtures/open-meteo-air-quality-delhi.json", "utf8"));
    const days: AirPayload["days"] = {};
    j.hourly.time.forEach((t: string, i: number) => {
      const [d, hh] = t.split("T");
      if (j.hourly.pm2_5[i] != null) (days[d] ??= {})[String(Number(hh.slice(0, 2)))] = j.hourly.pm2_5[i];
    });
    expect(Object.keys(days).length).toBeGreaterThanOrEqual(4);
    const day = Object.keys(days)[1];
    // force a very poor day to test the mapping, independent of today's real value
    const bad: AirPayload = { source: "Open-Meteo air quality", days: { [day]: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), 180])) } };
    expect(airSignals(mk({ archetype: "cafe" }), bad, day)[0].effectOverride).toBeCloseTo(-0.1, 5);
    expect(airSignals(mk({ archetype: "cloud_kitchen" }), bad, day)[0].effectOverride).toBeGreaterThan(0);
    expect(airSignals(mk({}), { source: "Open-Meteo air quality", days: {} }, day)).toEqual([]);
  });
});

describe("multiplier cap", () => {
  const flat = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 22 ? 50 : null));
  const baseline = Object.fromEntries(WEEKDAYS.map((d) => [d, flat])) as Baseline;
  const big = (k: Signal["kind"], e: number): Signal => ({ kind: k, label: k, source: "t", distanceKm: null, startHour: 0, endHour: 24, size: 1, effectOverride: e });
  it("stacked signals cannot exceed 2.5x or fall below 0.3x", () => {
    const base = { date: "2026-10-12", baseline, baselineSource: "own" as const, archetype: "cafe" as const, radiusKm: 2, weights: {}, taps: 10 };
    const up = forecast({ ...base, signals: [big("festival", 1), big("event", 1), big("payday", 1)] });
    const down = forecast({ ...base, signals: [big("festival", -0.9), big("rain", -0.9), big("aqi", -0.9)] });
    expect(up.hourly[12]!).toBeCloseTo(50 * 2.5, 5);
    expect(down.hourly[12]!).toBeCloseTo(50 * 0.3, 5);
  });
});

describe("long weekends and bridge days", () => {
  const lw = (p: Place, d: string) => longWeekendSignals(p, d).map((s) => [s.label, s.effectOverride]);
  it("Dussehra on Tue 20 Oct 2026: Mon is a bridge day, Tue is not part of a 3-day run", () => {
    expect(lw(mk({}), "2026-10-19")).toEqual([["Bridge day", -0.12]]);
    expect(lw(mk({}), "2026-10-20")).toEqual([]);
  });
  it("Christmas on Fri 25 Dec 2026 makes Fri to Sun a long weekend", () => {
    expect(lw(mk({}), "2026-12-25")[0][0]).toBe("Long weekend");
    expect(lw(mk({}), "2026-12-26")[0][0]).toBe("Long weekend");
  });
  it("residential areas go up, plain weekends and cloud kitchens get nothing", () => {
    expect(lw(mk({ area_type: "residential" }), "2026-12-27")).toEqual([["Long weekend", 0.08]]);
    expect(lw(mk({}), "2026-10-24")).toEqual([]);
    expect(lw(mk({ archetype: "cloud_kitchen" }), "2026-12-26")).toEqual([]);
  });
  it("is India only", () => {
    expect(lw(mk({ country: "United Kingdom", city: "London" }), "2026-12-26")).toEqual([]);
  });
});

describe("added regional festivals", () => {
  const names = (p: Place, d: string) => calendarSignals(p, d).map((s) => s.label);
  it("fire only in their region", () => {
    expect(names(mk({ archetype: "restaurant", city: "Chennai" }), "2027-01-15")).toContain("Pongal");
    expect(names(mk({ archetype: "restaurant", city: "Delhi" }), "2027-01-15")).not.toContain("Pongal");
    expect(names(mk({ archetype: "restaurant", city: "Delhi" }), "2027-01-13")).toContain("Lohri");
    expect(names(mk({ archetype: "restaurant", city: "Kochi" }), "2027-09-12")).toContain("Thiruvonam");
    expect(names(mk({ archetype: "restaurant", city: "Pune" }), "2027-09-04")).toContain("Ganesh Chaturthi");
    expect(names(mk({ archetype: "bar", city: "Delhi" }), "2026-11-24")[0]).toBe("Guru Nanak Jayanti");
  });
});
