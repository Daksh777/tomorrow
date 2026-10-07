import { NextResponse } from "next/server";
import {
  cityCountryFromAddress,
  fetchPlaceDetails,
  guessArchetype,
  lookupTimezone,
  peerBaseline,
} from "@/lib/place";
import { leagueIds } from "@/lib/signals/matches";
import { localDate, weekdayOf } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Onboarding steps 2 to 3: pull type, hours, location and the popular-times curve. */
export async function GET(req: Request) {
  const place_id = new URL(req.url).searchParams.get("place_id");
  if (!place_id) return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  try {
    const d = await fetchPlaceDetails(place_id);
    const archetype = guessArchetype(d.types);
    let baseline = d.baseline;
    let source: "own" | "peers" = "own";
    if (!baseline) {
      baseline = await peerBaseline(d.lat, d.lng, d.types[0] ?? "cafe", place_id);
      source = "peers";
    }
    const { city, country, area, state } = cityCountryFromAddress(d.address);
    const weekday = weekdayOf(localDate(await lookupTimezone(d.lat, d.lng), 1));
    return NextResponse.json({
      place_id,
      title: d.title,
      address: d.address,
      lat: d.lat,
      lng: d.lng,
      city,
      area,
      state,
      country,
      archetype,
      baseline,
      baselineSource: source,
      weekday,
      curve: baseline ? baseline[weekday] : null,
      leagueOptions: Object.keys(leagueIds()),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
