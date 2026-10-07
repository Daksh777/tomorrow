import Holidays from "date-holidays";
import type { Place, Signal } from "../types";
import { addDays, weekdayOf } from "../time";
import { countryCode } from "../place";
import { calendarHoliday } from "../india";
import config from "../../config/effects.json";

/** Static calendar, no search credits. Effect depends on office vs residential area. */
export function holidaySignals(place: Place, targetDate: string): Signal[] {
  const hd = new Holidays(countryCode(place.country));
  const [y, m, d] = targetDate.split("-").map(Number);
  const hit = hd.isHoliday(new Date(Date.UTC(y, m - 1, d, 6)));
  const pub = hit ? hit.find((h) => h.type === "public") : undefined;
  // date-holidays has only 6 public holidays for India and lacks Dussehra and Christmas Day; fill from our calendar.
  const extra = !pub && countryCode(place.country) === "IN" ? calendarHoliday(targetDate) : null;
  if (!pub && !extra) return [];
  const name = pub ? pub.name : extra!;
  return [
    {
      kind: "holiday",
      label: name,
      source: "Public holiday calendar",
      distanceKm: null,
      startHour: 0,
      endHour: 24,
      size: 1,
      effectOverride: config.holiday[place.area_type],
    },
  ];
}

/**
 * Long weekends and bridge days, computed from the same holiday calendar: no new dates to maintain.
 * A day off that sits in a run of three or more days off is a long weekend; a working day with a day
 * off on both sides is a bridge day. Magnitudes are assumptions (config/effects.json).
 */
export function longWeekendSignals(place: Place, targetDate: string): Signal[] {
  if (countryCode(place.country) !== "IN" || config.long_weekend.skip.includes(place.archetype)) return [];
  const off = (d: string) => {
    const w = weekdayOf(d);
    return w === "saturday" || w === "sunday" || holidaySignals(place, d).length > 0;
  };
  let label: string | null = null;
  if (off(targetDate)) {
    let run = 1;
    for (let d = addDays(targetDate, -1); run < 5 && off(d); d = addDays(d, -1)) run++;
    for (let d = addDays(targetDate, 1); run < 5 && off(d); d = addDays(d, 1)) run++;
    if (run >= 3) label = "Long weekend";
  } else if (off(addDays(targetDate, -1)) && off(addDays(targetDate, 1))) {
    label = "Bridge day";
  }
  if (!label) return [];
  return [
    {
      kind: "long_weekend",
      label,
      source: "Public holiday calendar",
      detail: "Days off on both sides. People travel or stay local; the size of the effect is a starting guess that your taps tune.",
      distanceKm: null,
      startHour: 0,
      endHour: 24,
      size: 1,
      effectOverride: config.long_weekend[place.area_type],
    },
  ];
}
