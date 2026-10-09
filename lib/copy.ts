import { complete } from "./llm";
import { LANGUAGES, LANGUAGE_NAME } from "./languages";
import { PHRASES } from "./phrases";
import type { Copy, DayPart, Forecast, Language, Place } from "./types";

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

/** Net change over the hours (all pins together, not one), as a fraction of the usual; null without curves. */
function netChange(f: Pick<Forecast, "hourly" | "baseline">, start: number, end: number): number | null {
  let usual = 0,
    delta = 0;
  for (let h = Math.max(0, Math.floor(start)); h < Math.min(24, Math.ceil(end)); h++) {
    const b = f.baseline[h];
    if (b == null || f.hourly[h] == null) continue;
    usual += b;
    delta += (f.hourly[h] as number) - b;
  }
  return usual ? delta / usual : null;
}

/** 37 -> 35, 143 -> 140: a count an owner would say. */
const roundUnits = (n: number) => (n < 20 ? n : Math.round(n / 5) * 5);
const round10 = (x: number) => Math.max(10, Math.round((x * 100) / 10) * 10);
/** Pins smaller than this (a festival few people here keep, say) are shown but don't change prep or staffing. */
const MIN_ACTION_EFFECT = 0.05;

/** Deterministic copy from computed buckets, in any language. Used when no model is available, and as the model's draft. */
export function ruleCopy(f: Forecast, placeName: string, units?: Units, lang: Language = "en"): Copy {
  const t = PHRASES[lang] ?? PHRASES.en;
  const day = t.day[f.weekday];
  const entries = Object.entries(f.ratios) as [DayPart, number][];
  const strongest = entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  let headline = t.usualDay(day);
  if (strongest && f.buckets[strongest[0]] !== "usual") headline = t.levelHeadline(f.buckets[strongest[0]]!, day, strongest[0]);

  const busyPin = [...f.pins].filter((p) => p.effect >= MIN_ACTION_EFFECT).sort((a, b) => b.effect - a.effect)[0];
  const quietPin = [...f.pins].filter((p) => p.effect <= -MIN_ACTION_EFFECT).sort((a, b) => a.effect - b.effect)[0];
  const unit = units?.unit ? t.unit(units.unit) : "";

  // Act on the side the day leans to: a quieter day with a small all-day payday lift must not say "prep more".
  const quietDay = !!strongest && strongest[1] < 0 && f.buckets[strongest[0]] !== "usual";
  const span = (p: { startHour: number; endHour: number }): [number, number] | null => {
    const s = Math.floor(p.startHour);
    const e = Math.min(Math.ceil(p.endHour), 24);
    return s <= 0 && e >= 24 ? null : [s, e];
  };

  // A pin acts only if its hours still move once every pin is counted: payday +6% under Pitru Paksha nets +2%.
  const net = (p: { startHour: number; endHour: number }) => {
    const w = span(p);
    return netChange(f, w?.[0] ?? 0, w?.[1] ?? 24);
  };
  const busyNet = busyPin ? net(busyPin) : null;
  const quietNet = quietPin ? net(quietPin) : null;

  if (busyPin && !(quietDay && quietPin) && (busyNet === null || busyNet >= MIN_ACTION_EFFECT)) {
    const w = span(busyPin);
    const n = unitsDelta(f, units, w?.[0] ?? 0, w?.[1] ?? 24);
    const pct = round10(busyNet ?? busyPin.effect);
    return {
      headline,
      actions: [n && n >= 5 ? t.prepMoreUnits(roundUnits(n), unit, pct, w?.[0] ?? null) : t.prepMore(pct, w?.[0] ?? null), t.staffMore(w)],
    };
  }
  if (quietPin && (quietNet === null || quietNet <= -MIN_ACTION_EFFECT)) {
    const w = span(quietPin);
    const n = unitsDelta(f, units, w?.[0] ?? 0, w?.[1] ?? 24);
    const pct = round10(-(quietNet ?? quietPin.effect));
    return {
      headline,
      actions: [n && n <= -5 ? t.prepLessUnits(roundUnits(-n), unit, pct, w) : t.prepLess(pct, w), t.staffLess(w)],
    };
  }
  return { headline, actions: [t.prepUsual(day), t.staffUsual] };
}

/**
 * The model only phrases what was computed. It is given buckets, pins and the
 * rule-based draft, and told not to add signals or numbers.
 */
export async function writeCopy(f: Forecast, place: Pick<Place, "name" | "language" | "usual_daily" | "unit">): Promise<Copy> {
  const lang: Language = place.language && place.language in LANGUAGES ? place.language : "en";
  // The draft is already in the owner's language, so a missing or failing model still gives the right words.
  const draft = ruleCopy(f, place.name, place, lang);
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
        "The forecast is for tomorrow: never call the day \"today\". Plain words, like a weather report. Use ONLY the facts given. Do not add events, causes, or numbers that are not in the facts. " +
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
