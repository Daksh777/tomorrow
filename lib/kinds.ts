import type { SignalKind } from "./types";

/** "How much does X move your place?" */
export const KIND_PHRASE: Record<SignalKind, string> = {
  match_stadium: "a match at a stadium near you",
  match_tv: "a big match on TV",
  event: "an event nearby",
  rain: "rain",
  holiday: "a public holiday",
  disruption: "a strike or road closure",
  festival: "a festival like this",
  payday: "the salary cycle (payday week and month-end)",
  aqi: "bad air quality",
  dry_day: "a dry day",
  long_weekend: "a long weekend or bridge day",
  hotels: "a jump in hotel prices (visitors arriving)",
  heat: "a hot afternoon",
  competitor: "a nearby place being closed",
  trend: "how fast your reviews are coming in",
  exams: "exam season",
  own_event: "your own plans",
  after_rain: "people coming out after the rain stops",
};

/** Short names for the "What moves your place" page. */
export const KIND_NAME: Record<SignalKind, string> = {
  match_stadium: "Matches at a stadium near you",
  match_tv: "Big matches on TV",
  event: "Events nearby",
  rain: "Rain",
  holiday: "Public holidays",
  disruption: "Strikes, protests and road closures",
  festival: "Festivals",
  payday: "Payday week and month-end",
  aqi: "Bad air",
  dry_day: "Dry days",
  long_weekend: "Long weekends",
  hotels: "Visitors arriving (hotel prices)",
  heat: "Hot afternoons",
  competitor: "A nearby place being closed",
  trend: "New reviews",
  exams: "Exam season",
  own_event: "Your own plans",
  after_rain: "After the rain stops",
};
