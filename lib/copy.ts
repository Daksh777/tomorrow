import { complete } from "./llm";
import { fmtHour } from "./time";
import type { Copy, DayPart, Forecast, Level } from "./types";

const PART_LABEL: Record<DayPart, string> = {
  morning: "in the morning",
  lunch: "at lunch",
  afternoon: "in the afternoon",
  evening: "after 6 pm",
  late: "late at night",
};
const ORDER: Level[] = ["quieter", "usual", "busier", "much busier"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const round10 = (x: number) => Math.max(10, Math.round((x * 100) / 10) * 10);

/** Deterministic copy from computed buckets. Used when no API key is set or the model fails. */
export function ruleCopy(f: Forecast, placeName: string): Copy {
  const day = cap(f.weekday);
  const entries = Object.entries(f.ratios) as [DayPart, number][];
  const strongest = entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  let headline = `A usual ${day}.`;
  if (strongest && f.buckets[strongest[0]] !== "usual") {
    const lvl = f.buckets[strongest[0]]!;
    headline = `${cap(lvl)} than a usual ${day} ${PART_LABEL[strongest[0]]}.`;
  }

  const busyPin = [...f.pins].filter((p) => p.effect > 0).sort((a, b) => b.effect - a.effect)[0];
  const quietPin = [...f.pins].filter((p) => p.effect < 0).sort((a, b) => a.effect - b.effect)[0];
  const actions: string[] = [];

  if (busyPin) {
    const s = Math.floor(busyPin.startHour);
    const e = Math.ceil(busyPin.endHour);
    actions.push(`Prep ${round10(busyPin.effect)}% more of your fast sellers before ${fmtHour(s)}.`);
    actions.push(`Keep one more person on ${fmtHour(s)} to ${fmtHour(Math.min(e, 24))}.`);
  } else if (quietPin) {
    const s = Math.floor(quietPin.startHour);
    const e = Math.ceil(quietPin.endHour);
    actions.push(`Prep ${round10(-quietPin.effect)}% less for ${fmtHour(s)} to ${fmtHour(Math.min(e, 24))}.`);
    actions.push(`Offer an early finish or a staggered start to one person.`);
  } else {
    actions.push(`Prep as you usually do on a ${day}.`);
    actions.push(`Keep your usual roster.`);
  }
  return { headline, actions: [actions[0], actions[1]] };
}

/**
 * The model only phrases what was computed. It is given buckets, pins and the
 * rule-based draft, and told not to add signals or numbers.
 */
export async function writeCopy(f: Forecast, placeName: string): Promise<Copy> {
  const draft = ruleCopy(f, placeName);
  const facts = {
    weekday: f.weekday,
    buckets: f.buckets,
    pins: f.pins.map((p) => ({
      label: p.label,
      distanceKm: p.distanceKm === null ? null : Math.round(p.distanceKm * 10) / 10,
      effect: p.effect > 0 ? "busier" : "quieter",
    })),
    draft,
  };
  try {
    const text = await complete(
      "You write the headline and two actions of a nightly demand forecast for a small food or retail business owner. " +
        "Plain words, like a weather report. Use ONLY the facts given. Do not add events, causes, or numbers that are not in the facts. " +
        "Headline: one sentence. Actions: two short sentences about prep and staffing, in the owner's units. " +
        "Keep every percentage and clock time from the draft actions exactly as written. " +
        'Reply with JSON only: {"headline": string, "actions": [string, string]}.',
      JSON.stringify(facts),
    );
    if (!text) return draft;
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (typeof j.headline === "string" && Array.isArray(j.actions) && j.actions.length >= 2) {
      // The model may rephrase, but must keep the draft's numbers; otherwise use the draft action.
      const keep = (a: unknown, d: string) => {
        const t = String(a);
        const nums = d.match(/\d+%?/g) ?? [];
        return nums.every((n) => t.includes(n)) ? t : d;
      };
      return { headline: j.headline, actions: [keep(j.actions[0], draft.actions[0]), keep(j.actions[1], draft.actions[1])] };
    }
  } catch {
    /* use the rule-based draft */
  }
  return draft;
}
