export type Archetype =
  | "cafe"
  | "restaurant"
  | "bar"
  | "quick_service"
  | "cloud_kitchen"
  | "retail"
  | "salon";

export type SignalKind =
  | "match_tv"
  | "match_stadium"
  | "event"
  | "rain"
  | "holiday"
  | "disruption"
  | "festival"
  | "payday"
  | "aqi"
  | "dry_day"
  | "long_weekend";

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** 24 values (hour 0..23), 0..100. null = no data for that hour (closed). */
export type DayCurve = (number | null)[];
export type Baseline = Record<Weekday, DayCurve>;

export interface Anchor {
  kind: "stadium" | "college" | "mall" | "venue";
  name: string;
  place_id?: string;
  lat: number;
  lng: number;
  reviews?: number;
}

export interface Place {
  place_id: string;
  name: string;
  archetype: Archetype;
  area_type: "office" | "residential";
  lat: number;
  lng: number;
  city: string;
  area?: string | null; // neighbourhood, used to find local disruptions
  state?: string | null; // Indian state, used for regional festivals
  country: string | null;
  timezone: string;
  radius_km: number;
  leagues: string[];
  baseline: Baseline;
  baseline_source: "own" | "peers";
  anchors: Anchor[];
}

/** An article behind a pin, so the owner can read it. */
export interface SourceLink {
  title: string;
  url: string;
  source?: string;
}

/** One reason that can move demand, with a visible source and distance. */
export interface Signal {
  kind: SignalKind;
  label: string; // "India vs Australia 7:30 pm"
  source: string; // "Google Sports", "Google Events", "Open-Meteo", ...
  detail?: string; // venue, headline, etc.
  distanceKm: number | null;
  /** local clock hours, fractional, may exceed 24 for after-midnight */
  startHour: number;
  endHour: number;
  /** 0..1 size scaling (events by venue reviews); 1 when not applicable */
  size: number;
  /** Override the table effect (used for holidays, which depend on area type) */
  effectOverride?: number;
  /** Articles behind this pin (news), best first. */
  links?: SourceLink[];
}

export type Level = "quieter" | "usual" | "busier" | "much busier";
export type DayPart = "morning" | "lunch" | "afternoon" | "evening" | "late";

export interface Pin {
  kind: SignalKind;
  label: string;
  source: string;
  detail?: string;
  distanceKm: number | null;
  startHour: number;
  endHour: number;
  effect: number; // signed, after distance/size scaling and the place's weight
  links?: SourceLink[];
}

export interface Forecast {
  date: string; // YYYY-MM-DD, local
  weekday: Weekday;
  baseline: (number | null)[]; // 24
  hourly: (number | null)[]; // F(h)
  lo: (number | null)[];
  hi: (number | null)[];
  buckets: Partial<Record<DayPart, Level>>;
  ratios: Partial<Record<DayPart, number>>;
  pins: Pin[];
  band: number; // fractional half-width
  taps: number;
  tuned: boolean;
  baselineSource: "own" | "peers";
}

export interface Copy {
  headline: string;
  actions: [string, string];
}
