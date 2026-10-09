import { describe, expect, it } from "vitest";
import { bucketOf, distanceScale, forecast, updateWeights } from "../lib/forecast";
import { parseHourLabel, curvesFromPopularTimes } from "../lib/place";
import { parseTimes } from "../lib/signals/events";
import { WEEKDAYS, type Baseline, type Signal } from "../lib/types";

// Synthetic curve used only to test the maths; the app itself never ships placeholder data.
const flat = (v: number) => Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 22 ? v : null));
const baseline = Object.fromEntries(WEEKDAYS.map((d) => [d, flat(50)])) as Baseline;

const stadium: Signal = {
  kind: "match_stadium",
  label: "Match",
  source: "test",
  distanceKm: 0,
  startHour: 18,
  endHour: 22,
  size: 1,
};
const rain: Signal = { kind: "rain", label: "Rain", source: "test", distanceKm: null, startHour: 14, endHour: 17, size: 1 };

const base = {
  date: "2026-10-08", // Thursday
  baseline,
  baselineSource: "own" as const,
  archetype: "cafe" as const,
  radiusKm: 2,
  weights: {},
  taps: 0,
};

describe("forecast", () => {
  it("leaves the baseline alone with no signals", () => {
    const f = forecast({ ...base, signals: [] });
    expect(f.weekday).toBe("thursday");
    expect(f.hourly[12]).toBe(50);
    expect(f.hourly[3]).toBeNull();
    expect(Object.values(f.buckets).every((b) => b === "usual")).toBe(true);
  });

  it("applies the café stadium effect (+30%) at the stadium", () => {
    const f = forecast({ ...base, signals: [stadium] });
    expect(f.hourly[19]).toBeCloseTo(65, 5);
    expect(f.buckets.evening).toBe("busier");
  });

  it("falls off linearly with distance to zero at the radius", () => {
    expect(distanceScale(0, 2)).toBe(1);
    expect(distanceScale(1, 2)).toBe(0.5);
    expect(distanceScale(2, 2)).toBe(0);
    expect(distanceScale(null, 2)).toBe(1);
    // plateau: full effect to 75% of the radius, then linear to zero
    expect(distanceScale(1.5, 2, 0.75)).toBe(1);
    expect(distanceScale(1.75, 2, 0.75)).toBe(0.5);
    expect(distanceScale(2, 2, 0.75)).toBe(0);
    const far = forecast({ ...base, signals: [{ ...stadium, distanceKm: 2 }] });
    expect(far.hourly[19]).toBe(50);
  });

  it("makes rain quieter for a café and busier for a cloud kitchen", () => {
    expect(forecast({ ...base, signals: [rain] }).hourly[15]).toBeCloseTo(42.5, 5);
    expect(forecast({ ...base, archetype: "cloud_kitchen", signals: [rain] }).hourly[15]).toBeCloseTo(65, 5);
  });

  it("widens the band when signals disagree and when there are few taps", () => {
    const agree = forecast({ ...base, taps: 10, signals: [stadium] }).band;
    const disagree = forecast({ ...base, taps: 10, signals: [stadium, { ...rain, startHour: 18, endHour: 21 }] }).band;
    expect(disagree).toBeGreaterThan(agree);
    expect(forecast({ ...base, taps: 0, signals: [stadium] }).band).toBeGreaterThan(agree);
  });

  it("scales by learned weight", () => {
    const f = forecast({ ...base, weights: { match_stadium: 2 }, signals: [stadium] });
    expect(f.hourly[19]).toBeCloseTo(80, 5);
  });

  it("shows 'Tuned to your place' after 7 taps", () => {
    expect(forecast({ ...base, taps: 6, signals: [] }).tuned).toBe(false);
    expect(forecast({ ...base, taps: 7, signals: [] }).tuned).toBe(true);
  });
});

describe("buckets", () => {
  it("uses the spec thresholds", () => {
    expect(bucketOf(-0.2)).toBe("quieter");
    expect(bucketOf(0)).toBe("usual");
    expect(bucketOf(0.2)).toBe("busier");
    expect(bucketOf(0.5)).toBe("much busier");
  });
});

describe("learning", () => {
  it("moves the weight by 0.2 × tap × sign(e) and clamps to 0..2", () => {
    const active = [{ kind: "match_stadium" as const, effect: 0.3 }];
    expect(updateWeights({}, active, 1).match_stadium).toBeCloseTo(1.2);
    expect(updateWeights({}, active, -1).match_stadium).toBeCloseTo(0.8);
    expect(updateWeights({ match_stadium: 1.95 }, active, 1).match_stadium).toBe(2);
    expect(updateWeights({ match_stadium: 0.1 }, active, -1).match_stadium).toBe(0);
    // a negative effect flips the direction: "busier" than forecast lowers the rain weight
    expect(updateWeights({}, [{ kind: "rain", effect: -0.15 }], 1).rain).toBeCloseTo(0.8);
    expect(updateWeights({}, active, 0).match_stadium).toBe(1);
  });
});

describe("parsers", () => {
  it("parses popular-times hour labels", () => {
    expect(parseHourLabel("6 AM")).toBe(6);
    expect(parseHourLabel("12 PM")).toBe(12);
    expect(parseHourLabel("12 AM")).toBe(0);
    expect(parseHourLabel("11 PM")).toBe(23);
  });
  it("builds 24-hour curves from graph_results", () => {
    const c = curvesFromPopularTimes({
      graph_results: { monday: [{ time: "6 AM", busyness_score: 10 }, { time: "7 PM", busyness_score: 90 }] },
    })!;
    expect(c.monday[6]).toBe(10);
    expect(c.monday[19]).toBe(90);
    expect(c.monday[12]).toBeNull();
    expect(curvesFromPopularTimes({})).toBeNull();
  });
  it("parses event times", () => {
    expect(parseTimes("Thu, 7 – 10 PM")).toEqual([19, 22]);
    expect(parseTimes("Fri, 7:30 PM")![0]).toBeCloseTo(19.5);
    expect(parseTimes("Sat, 4 PM – 9 PM")).toEqual([16, 21]);
    expect(parseTimes(undefined)).toBeNull();
  });
});

describe("owner-set weights", () => {
  it("scales the effect and widens the band only when set by hand and not default", () => {
    const run = (w: number, ownerSet: ("match_stadium")[]) =>
      forecast({ ...base, taps: 10, signals: [stadium], weights: { match_stadium: w }, ownerSet });
    const dflt = run(1, ["match_stadium"]);
    const more = run(1.5, ["match_stadium"]);
    const none = run(0, ["match_stadium"]);
    const learned = run(1.5, []); // same weight, learned from taps rather than set by the owner
    expect(more.hourly[19]!).toBeGreaterThan(dflt.hourly[19]!);
    expect(none.hourly[19]).toBeCloseTo(50, 5); // weight 0 removes the signal
    expect(more.band).toBeCloseTo(learned.band + 0.04, 5);
    expect(dflt.band).toBeCloseTo(learned.band, 5);
  });
});

describe("pins carry the weighted effect", () => {
  it("halves the pin effect when the owner weight is 0.5, and zeroes it at 0", () => {
    const f = (w: number) => forecast({ ...base, taps: 10, signals: [stadium], weights: { match_stadium: w } }).pins[0].effect;
    expect(f(0.5)).toBeCloseTo(f(1) / 2, 6);
    expect(f(0)).toBe(0);
  });
});

import { ruleCopy } from "../lib/copy";
describe("rule copy", () => {
  const base = { date: "2026-10-09", weekday: "friday", baseline: [], hourly: [], lo: [], hi: [], buckets: { lunch: "usual" }, ratios: { lunch: -0.01 }, band: 0.1, taps: 0, tuned: false, baselineSource: "own" } as any;
  const pin = (effect: number) => ({ kind: "festival", label: "Pitru Paksha", source: "t", distanceKm: null, startHour: 11, endHour: 23, effect });
  it("does not turn a tiny pin into a 10% prep change", () => {
    expect(ruleCopy({ ...base, pins: [pin(-0.0075)] }, "x").actions[0]).toBe("Prep as you usually do on a Friday.");
  });
  it("still acts on a real one", () => {
    expect(ruleCopy({ ...base, pins: [pin(-0.3)] }, "x").actions[0]).toBe("Prep 30% less for 11 am to 11 pm.");
  });
  it("acts on the side the day leans to, and says 'all day' for all-day pins", () => {
    const payday = { kind: "payday", label: "Payday week", source: "t", distanceKm: null, startHour: 0, endHour: 24, effect: 0.06 };
    const quiet = { ...base, buckets: { lunch: "quieter" }, ratios: { lunch: -0.2 }, pins: [payday, { ...payday, kind: "disruption", effect: -0.3 }] };
    expect(ruleCopy(quiet, "x").actions).toEqual(["Prep 30% less all day.", "Offer an early finish or a staggered start to one person."]);
    expect(ruleCopy({ ...base, pins: [payday] }, "x").actions).toEqual(["Prep 10% more of your fast sellers.", "Keep one more person on for your busiest hours."]);
  });
});
