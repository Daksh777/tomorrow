import Holidays from "date-holidays";
import type { Place, Signal } from "../types";
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
