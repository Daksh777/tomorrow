import { complete } from "./llm";
import { fmtHour } from "./time";
import { LANGUAGES, LANGUAGE_NAME } from "./languages";
import type { Copy, DayPart, Forecast, Language, Level, Place } from "./types";

/** The owner's own numbers: "about 300 orders on a usual day". */
export type Units = Pick<Place, "usual_daily" | "unit">;

/**
 * Extra (or fewer) units over a window: the usual day's count spread over its hours by the usual curve,
 * times the forecast's change in those hours. null without the owner's numbers.
 */
export function unitsDelta(f: Pick<Forecast, "hourly" | "baseline">, u: Units | undefined, start: number, end: number): number | null {
  if (!u?.usual_daily || !u.unit) return null;
  let day = 0,
    delta = 0;
  for (let h = 0; h < 24; h++) {
    const b = f.baseline[h];
    if (b == null || f.hourly[h] == null) continue;
    day += b;
    if (h >= Math.floor(start) && h < Math.ceil(end)) delta += (f.hourly[h] as number) - b;
  }
  if (!day) return null;
  return Math.round((u.usual_daily * delta) / day);
}

const PART_LABEL: Record<DayPart, string> = {
  morning: "in the morning",
  lunch: "at lunch",
  afternoon: "in the afternoon",
  evening: "after 6 pm",
  late: "late at night",
};
const ORDER: Level[] = ["quieter", "usual", "busier", "much busier"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** 37 -> 35, 143 -> 140: a count an owner would say. */
const roundUnits = (n: number) => (n < 20 ? n : Math.round(n / 5) * 5);
const round10 = (x: number) => Math.max(10, Math.round((x * 100) / 10) * 10);
/** Pins smaller than this (a festival few people here keep, say) are shown but don't change prep or staffing. */
const MIN_ACTION_EFFECT = 0.05;

/** Deterministic copy from computed buckets. Used when no API key is set or the model fails. */
export function ruleCopy(f: Forecast, placeName: string, units?: Units): Copy {
  const day = cap(f.weekday);
  const entries = Object.entries(f.ratios) as [DayPart, number][];
  const strongest = entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  let headline = `A usual ${day}.`;
  if (strongest && f.buckets[strongest[0]] !== "usual") {
    const lvl = f.buckets[strongest[0]]!;
    headline = `${cap(lvl)} than a usual ${day} ${PART_LABEL[strongest[0]]}.`;
  }

  const busyPin = [...f.pins].filter((p) => p.effect >= MIN_ACTION_EFFECT).sort((a, b) => b.effect - a.effect)[0];
  const quietPin = [...f.pins].filter((p) => p.effect <= -MIN_ACTION_EFFECT).sort((a, b) => a.effect - b.effect)[0];
  const actions: string[] = [];

  // Act on the side the day leans to: a quieter day with a small all-day payday lift must not say "prep more".
  const quietDay = !!strongest && strongest[1] < 0 && f.buckets[strongest[0]] !== "usual";
  const allDay = (s: number, e: number) => s <= 0 && e >= 24;

  if (busyPin && !(quietDay && quietPin)) {
    const s = Math.floor(busyPin.startHour);
    const e = Math.ceil(busyPin.endHour);
    const n = unitsDelta(f, units, s, e);
    const when = allDay(s, e) ? "" : ` before ${fmtHour(s)}`;
    actions.push(
      n && n >= 5
        ? `Prep about ${roundUnits(n)} more ${units!.unit} (${round10(busyPin.effect)}% more)${when}.`
        : `Prep ${round10(busyPin.effect)}% more of your fast sellers${when}.`,
    );
    actions.push(allDay(s, e) ? `Keep one more person on for your busiest hours.` : `Keep one more person on ${fmtHour(s)} to ${fmtHour(Math.min(e, 24))}.`);
  } else if (quietPin) {
    const s = Math.floor(quietPin.startHour);
    const e = Math.ceil(quietPin.endHour);
    const n = unitsDelta(f, units, s, e);
    const when = allDay(s, e) ? "all day" : `for ${fmtHour(s)} to ${fmtHour(Math.min(e, 24))}`;
    actions.push(
      n && n <= -5
        ? `Prep about ${roundUnits(-n)} fewer ${units!.unit} (${round10(-quietPin.effect)}% less) ${when}.`
        : `Prep ${round10(-quietPin.effect)}% less ${when}.`,
    );
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
export async function writeCopy(f: Forecast, place: Pick<Place, "name" | "language" | "usual_daily" | "unit">): Promise<Copy> {
  const draft = ruleCopy(f, place.name, place);
  const lang: Language = place.language && place.language in LANGUAGES ? place.language : "en";
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
        "Keep every percentage, count and clock time from the draft actions exactly as written, in Western digits (0-9). " +
        (lang !== "en"
          ? `Write the headline and actions in ${LANGUAGE_NAME[lang]}, in everyday spoken words a shop owner uses (English loanwords like "prep" or "staff" are fine). `
          : "") +
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
