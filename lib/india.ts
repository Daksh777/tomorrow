import calendar from "../config/india-calendar.json";
import culture from "../config/india-culture.json";
import effects from "../config/effects.json";
import { baseEffect } from "./forecast";
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
  "navi mumbai": "Maharashtra", mangaluru: "Karnataka", mangalore: "Karnataka", mohali: "Punjab",
  visakhapatnam: "Andhra Pradesh", vijayawada: "Andhra Pradesh", panaji: "Goa", panjim: "Goa", margao: "Goa",
  shillong: "Meghalaya", gangtok: "Sikkim", kohima: "Nagaland", aizawl: "Mizoram", agartala: "Tripura",
};

/** Old and alternate spellings, so 'city:' keys in config only need the current name. */
const CITY_ALIAS: Record<string, string> = {
  bangalore: "bengaluru", gurgaon: "gurugram", mangalore: "mangaluru", mysore: "mysuru", bombay: "mumbai",
  calcutta: "kolkata", "new delhi": "delhi", panjim: "panaji", trivandrum: "thiruvananthapuram", cochin: "kochi",
};

function cityKey(city: string | null | undefined): string {
  const c = (city ?? "").trim().toLowerCase();
  return CITY_ALIAS[c] ?? c;
}

/** Most specific entry wins: 'city:<name>', then the state, then any 'group:<name>', then 'default'. */
function lookupLocal<T>(
  table: Record<string, T>,
  place: Pick<Place, "city" | "state" | "country">,
  groups: string[] = [],
): { value: T | undefined; where: string | null } {
  const city = cityKey(place.city);
  const state = stateOf(place);
  if (city && table[`city:${city}`] !== undefined) return { value: table[`city:${city}`], where: place.city ?? city };
  if (state && table[state] !== undefined) return { value: table[state], where: state };
  for (const g of groups) if (table[`group:${g}`] !== undefined) return { value: table[`group:${g}`], where: state };
  return { value: table.default, where: null };
}

export function stateOf(place: Pick<Place, "city" | "state" | "country">): string | null {
  if (place.country && place.country.toLowerCase() !== "india") return null;
  return place.state?.trim() || CITY_STATE[(place.city ?? "").toLowerCase()] || null;
}

const isIndia = (p: Pick<Place, "country">) => !p.country || p.country.toLowerCase() === "india";

type CalEvent = (typeof calendar.events)[number] & {
  regionGroup?: string;
  holidayDates?: string[];
  observance?: Record<string, number>;
};
const EVENTS = calendar.events as CalEvent[];

function regionOk(e: CalEvent, state: string | null): boolean {
  if (!e.regionGroup) return true;
  const group = (calendar.regionGroups as Record<string, string[]>)[e.regionGroup] ?? [];
  return !!state && group.includes(state);
}

/**
 * How widely a festival is kept where the place is, 0 to 1.5. Pitru Paksha matters in Varanasi
 * and barely in Delhi; Navratri's alcohol dip is deep in Gujarat and shallow in Bengaluru.
 */
export function observanceOf(e: CalEvent, place: Pick<Place, "city" | "state" | "country">): { strength: number; where: string | null } {
  if (!regionOk(e, stateOf(place))) return { strength: 0, where: null };
  if (!e.observance) return { strength: 1, where: null };
  const { value, where } = lookupLocal(e.observance, place, e.regionGroup ? [e.regionGroup] : []);
  return { strength: value ?? 1, where };
}

function observanceNote(strength: number, where: string | null): string {
  if (!where || strength === 1) return "";
  if (strength > 1) return ` Bigger in ${where} than in most of India.`;
  if (strength <= 0.35) return ` Few people in ${where} keep it, so the effect here is small.`;
  return ` Kept less widely in ${where}, so the effect is scaled down.`;
}

/** Festivals on a date, for fetching their search interest before building pins. */
export function festivalsOn(targetDate: string): CalEvent[] {
  return EVENTS.filter((e) => targetDate >= e.start && targetDate <= e.end);
}

/** Measured observance from Google Trends: festival id -> strength (0.15..1.5) and the numbers behind it. */
export type MeasuredObservance = Record<string, { strength: number; value: number; median: number }>;

/** Weight of the Trends measurement against the hand-set observance. */
const MEASURED_WEIGHT = 0.5;

/**
 * Festival and dry-day pins for one date, by archetype. India only. When Google Trends interest for
 * the festival is known, the hand-set observance is blended half and half with the measured one;
 * a festival the region gate turns off stays off.
 */
export function calendarSignals(place: Place, targetDate: string, measured: MeasuredObservance = {}): Signal[] {
  if (!isIndia(place)) return [];
  const out: Signal[] = [];
  for (const e of EVENTS) {
    if (targetDate < e.start || targetDate > e.end) continue;
    const set = observanceOf(e, place);
    const m = measured[e.id];
    const strength = set.strength && m ? (1 - MEASURED_WEIGHT) * set.strength + MEASURED_WEIGHT * m.strength : set.strength;
    const where = set.where ?? (m ? stateOf(place) : null);
    const eff = ((e.effects as Record<string, number>)[place.archetype] ?? 0) * strength;
    if (!eff) continue;
    const trendsNote = m && set.strength ? ` Search interest in ${stateOf(place)}: ${m.value}/100 (median state ${m.median}).` : "";
    out.push({
      kind: "festival",
      label: e.name,
      source: m && set.strength ? "India festival calendar, Google Trends" : "India festival calendar",
      detail: e.culture + observanceNote(strength, where) + trendsNote,
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

type DrinkingProfile = { label: string; bar_boost: number; bar_dip: number; dry_day: number };
export type DrinkingCulture = "dry" | "low" | "medium" | "high";

/** The local drinking-out culture: dry states, pub cities, and the rest. India only. */
export function drinkingCulture(place: Pick<Place, "city" | "state" | "country">): { culture: DrinkingCulture; where: string | null } | null {
  if (!isIndia(place)) return null;
  const { value, where } = lookupLocal(culture.drinking.places as Record<string, string>, place);
  return { culture: (value ?? "medium") as DrinkingCulture, where };
}

/** Kinds whose lift for a bar comes from people going out to drink. */
const BAR_BOOST_KINDS = new Set(["match_tv", "match_stadium", "event", "payday", "festival"]);

/**
 * Scale alcohol-led signals by the local drinking culture. Bars get bigger crowd boosts in pub
 * cities and smaller ones in dry states; festival abstinence bites less where drinking out is
 * common; dry days change nothing in a dry state. Weather, air and disruptions are left alone.
 */
export function applyDrinkingCulture(place: Place, signals: Signal[]): Signal[] {
  const dc = drinkingCulture(place);
  if (!dc || dc.culture === "medium") return signals;
  const prof = (culture.drinking.profiles as Record<string, DrinkingProfile>)[dc.culture];
  const where = dc.where ?? "this area";
  const out: Signal[] = [];
  for (const s of signals) {
    let f = 1;
    if (s.kind === "dry_day") f = prof.dry_day;
    else if (place.archetype === "bar" && BAR_BOOST_KINDS.has(s.kind)) {
      const e = baseEffect(place.archetype, s);
      f = e > 0 ? prof.bar_boost : s.kind === "festival" ? prof.bar_dip : 1;
    }
    if (f === 1) {
      out.push(s);
      continue;
    }
    if (f === 0) continue;
    const note = `Scaled for ${where}: ${prof.label}.`;
    out.push({ ...s, effectOverride: baseEffect(place.archetype, s) * f, detail: s.detail ? `${s.detail} ${note}` : note });
  }
  return out;
}

/**
 * Board-exam season (config/effects.json `exams`): evenings in residential areas go a little quieter.
 * The window is approximate until the date sheet is published; the pin says so.
 */
export function examSignals(place: Place, targetDate: string): Signal[] {
  if (!isIndia(place)) return [];
  const c = effects.exams;
  const w = c.windows.find((x) => targetDate >= x.start && targetDate <= x.end);
  if (!w) return [];
  const eff = ((c.effect as Record<string, number>)[place.archetype] ?? 0) * ((c.area_type as Record<string, number>)[place.area_type] ?? 1);
  if (!eff) return [];
  return [
    {
      kind: "exams",
      label: w.name,
      source: "School exam calendar",
      detail: "Families with children at school stay in on exam evenings. The dates are approximate until the board publishes its date sheet.",
      distanceKm: null,
      startHour: c.hours[0],
      endHour: c.hours[1],
      size: 1,
      effectOverride: eff,
    },
  ];
}
