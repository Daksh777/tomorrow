import { describe, expect, it } from "vitest";
import { correctedCurve, usualCorrection } from "../lib/correction";
import { occursOn, ownerEventSignals } from "../lib/ownerEvents";
import { callKind } from "../lib/serp";
import type { Observation, OwnerEvent, Pin } from "../lib/types";

const reading = (date: string, hour: number, live: number, usual: number): Observation => ({ date, hour, live, usual, reviews: null });

describe("usual-curve correction from live readings", () => {
  // Five Saturday evenings at 20:00, live 60 against Google's usual 80.
  const sats = ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03"];
  const obs = sats.map((d) => reading(d, 20, 60, 80));

  it("finds evenings running quieter, shrunk towards no change while readings are few", () => {
    const c = usualCorrection(obs, {}, "saturday");
    const raw = 65 / 85;
    expect(c.evening!.factor).toBeLessThan(1);
    expect(c.evening!.factor).toBeGreaterThan(raw); // shrunk
    expect(c.evening!.n).toBe(5);
    expect(c.lunch).toBeUndefined();
  });

  it("ignores hours a notable signal touched", () => {
    const pins: Record<string, Pin[]> = Object.fromEntries(
      sats.map((d) => [d, [{ kind: "match_stadium", label: "", source: "", distanceKm: 1, startHour: 17, endHour: 22, effect: 0.3 } as Pin]]),
    );
    expect(usualCorrection(obs, pins, "saturday")).toEqual({});
  });

  it("weights the target weekday more than other days", () => {
    const mixed = [...obs, ...["2026-09-07", "2026-09-14", "2026-09-21"].map((d) => reading(d, 20, 80, 80))];
    const sat = usualCorrection(mixed, {}, "saturday").evening!.factor;
    const mon = usualCorrection(mixed, {}, "monday").evening?.factor ?? 1;
    expect(sat).toBeLessThan(mon);
  });

  it("scales only the corrected part of the day", () => {
    const curve = Array.from({ length: 24 }, (_, h) => (h >= 8 ? 50 : null));
    const out = correctedCurve(curve, { evening: { factor: 0.8, n: 5 } });
    expect(out[19]).toBe(40);
    expect(out[12]).toBe(50);
    expect(out[3]).toBeNull();
  });
});

describe("the owner's own plans", () => {
  const quiz: OwnerEvent = { id: 1, date: "2026-10-16", weekly: true, start_hour: 20, end_hour: 23, label: "Quiz night", level: "much_busier" };
  it("repeats weekly from its first date only", () => {
    expect(occursOn(quiz, "2026-10-16")).toBe(true);
    expect(occursOn(quiz, "2026-10-23")).toBe(true);
    expect(occursOn(quiz, "2026-10-09")).toBe(false);
    expect(occursOn(quiz, "2026-10-17")).toBe(false);
    expect(occursOn({ ...quiz, weekly: false }, "2026-10-23")).toBe(false);
  });
  it("becomes a pin with the owner's estimate", () => {
    const [s] = ownerEventSignals([quiz], "2026-10-23");
    expect(s).toMatchObject({ kind: "own_event", label: "Quiz night", source: "Your plans", startHour: 20, endHour: 23, effectOverride: 0.4 });
  });
});

describe("SerpApi call log", () => {
  it("names each call by what it was for", () => {
    expect(callKind({ engine: "google_maps", place_id: "x" })).toBe("place");
    expect(callKind({ engine: "google", q: "weather tomorrow Bengaluru" })).toBe("weather");
    expect(callKind({ engine: "google", q: "events this week" })).toBe("events");
    expect(callKind({ engine: "google_hotels", q: "hotels in Bengaluru" })).toBe("hotels");
  });
});
