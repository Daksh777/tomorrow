import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { liveFromPopularTimes, hoursFrom } from "../lib/place";
import { hotelPrices, hotelSignals, priceRatio } from "../lib/signals/hotels";
import { interestFrom, measuredObservance } from "../lib/signals/trends";
import { heatIndexC, heatSignals, fromAnswerBox } from "../lib/signals/weather";
import { closedOn, competitorSignals } from "../lib/signals/competitors";
import { reviewVelocity, trendSignals } from "../lib/signals/trend";
import { calendarSignals, examSignals } from "../lib/india";
import { calibrateBand, dayRatio, forecast, scoreDay, sharedHours, updateWeights } from "../lib/forecast";
import { ruleCopy, unitsDelta } from "../lib/copy";
import { canEdit, newEditKey } from "../lib/editkey";
import { WEEKDAYS, type Baseline, type Observation, type Place, type Signal } from "../lib/types";

// Raw SerpApi responses saved under /fixtures (real calls, not synthetic data).
const load = (prefix: string) => {
  const f = readdirSync("fixtures").filter((x) => x.startsWith(prefix)).sort()[0]!;
  return JSON.parse(readFileSync(`fixtures/${f}`, "utf8"));
};

const flat = (v: number | null) => Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 22 ? v : null));
const baseline = Object.fromEntries(WEEKDAYS.map((d) => [d, flat(50)])) as Baseline;
const place = (over: Partial<Place> = {}): Place => ({
  place_id: "p",
  name: "Test café",
  archetype: "cafe",
  area_type: "residential",
  lat: 12.97,
  lng: 77.6,
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  timezone: "Asia/Kolkata",
  radius_km: 2,
  leagues: [],
  baseline,
  baseline_source: "own",
  anchors: [],
  ...over,
});

describe("live busyness (real response)", () => {
  it("reads the live score from the current hour inside graph_results", () => {
    const res = load("google-maps-ChIJoVIBOaUXrjsRbF451NgeXrA-1791559003173");
    const live = liveFromPopularTimes(res.place_results.popular_times);
    expect(live).toEqual({ score: 74, usual: 84, hour: 20, info: "A little busy" });
    expect(res.place_results.popular_times.live_busyness_score).toBeUndefined();
  });
  it("reads weekly hours from both shapes Google returns", () => {
    expect(hoursFrom([{ friday: "8 AM–12 AM" }, { saturday: "Closed" }])).toEqual({ friday: "8 AM–12 AM", saturday: "Closed" });
    expect(hoursFrom({ monday: "11 AM–11 PM" })).toEqual({ monday: "11 AM–11 PM" });
  });
});

describe("hotel prices (real response)", () => {
  it("parses nightly rates and compares hotel by hotel", () => {
    const prices = hotelPrices(load("google-hotels-hotels-in-Bengaluru"));
    expect(prices.size).toBe(20);
    const up = new Map([...prices].map(([k, v]) => [k, v * 1.4]));
    expect(priceRatio(up, prices)).toEqual({ ratio: expect.closeTo(1.4, 5), matched: 20 });
  });
  it("fires only on a real rise with enough matched hotels", () => {
    const p = place();
    expect(hotelSignals(p, { ratio: 1.05, matched: 20, target: "2026-10-10", reference: "2026-10-24" }, "2026-10-10")).toEqual([]);
    expect(hotelSignals(p, { ratio: 1.6, matched: 3, target: "2026-10-10", reference: "2026-10-24" }, "2026-10-10")).toEqual([]);
    const [s] = hotelSignals(p, { ratio: 1.6, matched: 15, target: "2026-10-10", reference: "2026-10-24" }, "2026-10-10");
    expect(s.label).toBe("Hotel prices up 60% tomorrow night");
    expect(s.effectOverride).toBeCloseTo(0.08);
  });
});

describe("Google Trends observance (real response)", () => {
  it("scales a festival by the state's search interest against the median state", () => {
    const interest = interestFrom(load("google-trends-Navratri"));
    expect(interest["Delhi"]).toBe(92);
    const m = measuredObservance(interest, "Delhi")!;
    expect(m.strength).toBeGreaterThan(1);
    const low = Object.entries(interest).sort((a, b) => a[1] - b[1])[0][0];
    expect(measuredObservance(interest, low)!.strength).toBeLessThan(1);
  });
  it("blends with the calendar but never revives a festival the region gate turned off", () => {
    const p = place({ city: "Delhi", state: "Delhi" });
    const plain = calendarSignals(p, "2026-10-15").find((s) => s.label === "Navratri")!;
    const blended = calendarSignals(p, "2026-10-15", { navratri: { strength: 1.4, value: 92, median: 60 } }).find((s) => s.label === "Navratri")!;
    expect(Math.abs(blended.effectOverride!)).toBeGreaterThan(Math.abs(plain.effectOverride!));
    expect(blended.source).toContain("Google Trends");
    const kerala = place({ city: "Kochi", state: "Kerala" });
    expect(calendarSignals(kerala, "2026-10-17", { durga_puja: { strength: 1.5, value: 80, median: 40 } }).some((s) => s.label === "Durga Puja")).toBe(false);
  });
});

describe("heat", () => {
  it("uses the heat index and makes one pin per hot stretch", () => {
    expect(heatIndexC(25, 90)).toBe(25);
    expect(heatIndexC(35, 60)).toBeGreaterThan(44);
    const hours: Record<string, { rain: number; mm: number; feels?: number }> = {};
    for (let h = 0; h < 24; h++) hours[h] = { rain: 0, mm: 0, feels: h >= 12 && h < 16 ? 42 : 30 };
    const [s] = heatSignals(place(), { source: "Open-Meteo", days: { "2027-05-10": hours } }, "2027-05-10");
    expect([s.startHour, s.endHour, s.effectOverride]).toEqual([12, 16, -0.1]);
  });
  it("reads temperature from the real answer box in Fahrenheit", () => {
    const p = fromAnswerBox(load("google-weather-tomorrow-Bengaluru"), "2026-10-07")!;
    const f = p.days["2026-10-07"]["17"].feels!;
    expect(f).toBeGreaterThan(20);
    expect(f).toBeLessThan(35);
  });
});

describe("nearby places closed", () => {
  const peer = (name: string, lat: number, sat: string) => ({ place_id: name, name, lat, lng: 77.6, hours: { saturday: sat } });
  it("adds a small boost for each same-type place closed tomorrow, by distance", () => {
    expect(closedOn(peer("a", 12.97, "Closed"), "2026-10-10")).toBe(true);
    expect(closedOn(peer("a", 12.97, "8 AM–11 PM"), "2026-10-10")).toBe(false);
    const [s] = competitorSignals(place(), [peer("Next door", 12.9705, "Closed"), peer("Far", 13.1, "Closed")], "2026-10-10");
    expect(s.label).toBe("Next door is closed tomorrow");
    expect(s.effectOverride).toBeGreaterThan(0.03);
    expect(s.distanceKm).toBeNull();
  });
});

describe("review velocity", () => {
  const snap = (date: string, reviews: number): Observation => ({ date, hour: 20, live: null, usual: null, reviews });
  it("needs both windows covered, then compares reviews per day", () => {
    expect(reviewVelocity([snap("2026-10-01", 100), snap("2026-10-08", 110)], "2026-10-09")).toBeNull();
    const obs = [snap("2026-08-15", 100), snap("2026-09-12", 128), snap("2026-09-26", 142), snap("2026-10-10", 170)];
    const v = reviewVelocity(obs, "2026-10-10")!;
    expect(v.recent).toBeCloseTo(2);
    expect(v.prior).toBeCloseTo(1);
    expect(trendSignals(obs, "2026-10-10")[0].effectOverride).toBeCloseTo(0.05);
  });
});

describe("exam season", () => {
  it("dips residential evenings inside the window only", () => {
    expect(examSignals(place(), "2027-03-01")[0].effectOverride).toBeCloseTo(-0.04);
    expect(examSignals(place({ area_type: "office" }), "2027-03-01")[0].effectOverride).toBeCloseTo(-0.012);
    expect(examSignals(place(), "2027-05-01")).toEqual([]);
  });
});

describe("learning v2", () => {
  it("gives each signal credit by its share of the biggest effect", () => {
    const w = updateWeights({}, [{ kind: "match_stadium", effect: 0.4 }, { kind: "payday", effect: 0.04 }], 1);
    expect(w.match_stadium).toBeCloseTo(1.2);
    expect(w.payday).toBeCloseTo(1.02);
  });
  it("takes a measured outcome between -1 and 1", () => {
    expect(updateWeights({}, [{ kind: "event", effect: 0.2 }], 0.5).event).toBeCloseTo(1.1);
    expect(updateWeights({}, [{ kind: "event", effect: 0.2 }], 5).event).toBeCloseTo(1.2);
  });
});

describe("scoring and calibration", () => {
  const f = { hourly: flat(50), lo: flat(40), hi: flat(60), baseline: flat(50) };
  it("scores live readings against the band", () => {
    const s = scoreDay(f, [
      { hour: 12, live: 55 },
      { hour: 13, live: 75 },
      { hour: 3, live: 20 },
    ])!;
    expect(s).toEqual({ n: 2, inside: 1, meanMiss: expect.closeTo(0.3, 5) });
  });
  it("measures the band that would have held 80% of readings", () => {
    const pairs = [0.05, 0.1, 0.1, 0.15, 0.2, 0.2, 0.25, 0.3, 0.4, 0.6].map((e) => ({ live: 50 * (1 + e), forecast: 50 }));
    expect(calibrateBand(pairs)).toEqual({ band: expect.closeTo(0.3, 5), n: 10 });
  });
  it("moves the band towards the measured width as readings pile up, and widens days further out", () => {
    const input = { date: "2026-10-10", baseline, baselineSource: "own" as const, archetype: "cafe" as const, radiusKm: 2, signals: [], weights: {}, taps: 8 };
    const rule = forecast(input).band;
    expect(forecast({ ...input, calibration: { band: 0.3, n: 200 } }).band).toBeCloseTo((20 / 220) * rule + (200 / 220) * 0.3);
    expect(forecast({ ...input, horizonDays: 5 }).band).toBeCloseTo(rule + 0.12);
  });
  it("counts overlap past midnight when two signals disagree", () => {
    const a = { startHour: 22, endHour: 26 } as Signal;
    const b = { startHour: 0, endHour: 3 } as Signal;
    expect(sharedHours(a, b)).toBeCloseTo(2);
  });
});

describe("quantities", () => {
  it("turns the forecast into the owner's units", () => {
    const hourly = flat(50).map((v, h) => (v !== null && h >= 18 && h < 22 ? v * 1.3 : v));
    const f = { hourly, baseline: flat(50) };
    // 15 open hours of 50; 4 hours at +15 each = 60 of 750 -> 8% of 300 = 24
    expect(unitsDelta(f, { usual_daily: 300, unit: "coffees" }, 18, 22)).toBe(24);
    expect(unitsDelta(f, { usual_daily: null, unit: null }, 18, 22)).toBeNull();
    expect(dayRatio(f)).toBeCloseTo(1.08);
  });
  it("writes the count into the prep action", () => {
    const fc = forecast({
      date: "2026-10-10",
      baseline,
      baselineSource: "own",
      archetype: "cafe",
      radiusKm: 2,
      signals: [{ kind: "event", label: "Gig", source: "x", distanceKm: null, startHour: 18, endHour: 22, size: 1, effectOverride: 0.3 }],
      weights: {},
      taps: 0,
    });
    expect(ruleCopy(fc, "x", { usual_daily: 300, unit: "coffees" }).actions[0]).toBe("Prep about 25 more coffees (30% more) before 6 pm.");
  });
});

describe("edit key", () => {
  it("lets the key holder edit and refuses others; old places without a key stay open", () => {
    const { key, hash } = newEditKey();
    expect(canEdit({ edit_key_hash: hash }, key)).toBe(true);
    expect(canEdit({ edit_key_hash: hash }, "nope")).toBe(false);
    expect(canEdit({ edit_key_hash: hash }, null)).toBe(false);
    expect(canEdit({ edit_key_hash: null }, null)).toBe(true);
  });
});
