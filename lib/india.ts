import calendar from "../config/india-calendar.json";
import effects from "../config/effects.json";
import { weekdayOf } from "./time";
import type { Archetype, Place, Signal } from "./types";

/** Big-city fallback when the address gave no state. Keys are lower-case. */
const CITY_STATE: Record<string, string> = {
  delhi: "Delhi", "new delhi": "Delhi", gurugram: "Haryana", gurgaon: "Haryana", faridabad: "Haryana",
  noida: "Uttar Pradesh", ghaziabad: "Uttar Pradesh", lucknow: "Uttar Pradesh", kanpur: "Uttar Pradesh", varanasi: "Uttar Pradesh",
  mumbai: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra", thane: "Maharashtra", nashik: "Maharashtra",
  bengaluru: "Karnataka", bangalore: "Karnataka", mysuru: "Karnataka", mysore: "Karnataka",
  chennai: "Tamil Nadu", coimbatore: "Tamil Nadu", madurai: "Tamil Nadu",
  hyderabad: "Telangana", kolkata: "West Bengal", howrah: "West Bengal", siliguri: "West Bengal",
  ahmedabad: "Gujarat", surat: "Gujarat", vadodara: "Gujarat", rajkot: "Gujarat",
  jaipur: "Rajasthan", udaipur: "Rajasthan", jodhpur: "Rajasthan",
  chandigarh: "Chandigarh", ludhiana: "Punjab", amritsar: "Punjab",
  kochi: "Kerala", thiruvananthapuram: "Kerala", kozhikode: "Kerala",
  patna: "Bihar", ranchi: "Jharkhand", bhubaneswar: "Odisha", guwahati: "Assam",
  indore: "Madhya Pradesh", bhopal: "Madhya Pradesh", dehradun: "Uttarakhand", shimla: "Himachal Pradesh",
};

export function stateOf(place: Pick<Place, "city" | "state" | "country">): string | null {
  if (place.country && place.country.toLowerCase() !== "india") return null;
  return place.state?.trim() || CITY_STATE[(place.city ?? "").toLowerCase()] || null;
}

const isIndia = (p: Pick<Place, "country">) => !p.country || p.country.toLowerCase() === "india";

type CalEvent = (typeof calendar.events)[number] & { regionGroup?: string; holidayDates?: string[] };
const EVENTS = calendar.events as CalEvent[];

function regionOk(e: CalEvent, state: string | null): boolean {
  if (!e.regionGroup) return true;
  const group = (calendar.regionGroups as Record<string, string[]>)[e.regionGroup] ?? [];
  return !!state && group.includes(state);
}

/** Festival and dry-day pins for one date, by archetype. India only. */
export function calendarSignals(place: Place, targetDate: string): Signal[] {
  if (!isIndia(place)) return [];
  const state = stateOf(place);
  const out: Signal[] = [];
  for (const e of EVENTS) {
    if (targetDate < e.start || targetDate > e.end || !regionOk(e, state)) continue;
    const eff = (e.effects as Record<string, number>)[place.archetype];
    if (!eff) continue;
    out.push({
      kind: "festival",
      label: e.name,
      source: "India festival calendar",
      detail: e.culture,
      distanceKm: null,
      startHour: e.hours[0],
      endHour: e.hours[1],
      size: 1,
      effectOverride: eff,
    });
  }
  if (calendar.dryDays.dates.includes(targetDate)) {
    const eff = (calendar.dryDays.effects as Record<string, number>)[place.archetype];
    if (eff)
      out.push({
        kind: "dry_day",
        label: "Dry day: no alcohol served",
        source: "National dry-day calendar",
        distanceKm: null,
        startHour: 0,
        endHour: 24,
        size: 1,
        effectOverride: eff,
      });
  }
  return out;
}

/** Gazetted holidays the date-holidays library lacks (it has 6 for India; no Dussehra or Diwali). */
export function calendarHoliday(targetDate: string): string | null {
  const e = EVENTS.find((x) => x.holidayDates?.includes(targetDate));
  return e ? e.name : null;
}

/**
 * Salary cycle. Salaried India is paid around the 1st to 7th: full effect on days 1 to 3, half on 4 to 7,
 * weekends up to the 10th get a boost, and the last days of the month tighten budgets.
 * Starting guesses (config/effects.json), tuned by taps and owner weights.
 */
export function paydaySignals(place: Place, targetDate: string): Signal[] {
  if (!isIndia(place)) return [];
  const day = Number(targetDate.slice(8, 10));
  const wd = weekdayOf(targetDate);
  const weekend = wd === "saturday" || wd === "sunday";
  const cfg = effects.payday;
  const areaF = cfg.area_type[place.area_type] ?? 1;
  const arch = place.archetype as Archetype;

  let strength = 0;
  let label = "";
  let base = 0;
  if (day <= 3) strength = 1;
  else if (day <= 7) strength = 0.5;
  else if (day <= 10 && weekend) strength = 0.5;
  if (strength) {
    base = (cfg.up as Record<string, number>)[arch] ?? 0;
    if (weekend) strength *= cfg.weekend_boost;
    label = "Payday week";
  } else if (day >= 26) {
    strength = 1;
    base = (cfg.down as Record<string, number>)[arch] ?? 0;
    label = "Month-end budgets";
  }
  const effect = base * strength * areaF;
  if (!effect) return [];
  return [
    {
      kind: "payday",
      label,
      source: "Salary cycle",
      detail: "Most salaries land between the 1st and 7th. A starting guess that your taps tune.",
      distanceKm: null,
      startHour: 0,
      endHour: 24,
      size: 1,
      effectOverride: effect,
    },
  ];
}
