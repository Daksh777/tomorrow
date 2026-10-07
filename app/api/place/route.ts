import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchPlaceDetails, findAnchors, lookupTimezone, peerBaseline } from "@/lib/place";
import type { Archetype } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ARCHETYPES: Archetype[] = ["cafe", "restaurant", "bar", "quick_service", "cloud_kitchen", "retail", "salon"];

/** Onboarding steps 4 to 6: save the place with the owner's choices, then the card is built on first view. */
export async function POST(req: Request) {
  const b = await req.json();
  const { place_id, archetype, area_type, radius_km, leagues, city, country, area, state } = b;
  if (!place_id || !ARCHETYPES.includes(archetype)) {
    return NextResponse.json({ error: "place_id and a valid archetype are required" }, { status: 400 });
  }
  try {
    const d = await fetchPlaceDetails(place_id);
    let baseline = d.baseline;
    let source: "own" | "peers" = "own";
    if (!baseline) {
      baseline = await peerBaseline(d.lat, d.lng, d.types[0] ?? "cafe", place_id);
      source = "peers";
    }
    if (!baseline) {
      return NextResponse.json({ error: "No popular-times data for this place or its neighbours" }, { status: 422 });
    }
    const radius = Number(radius_km) || 2;
    const [anchors, timezone] = await Promise.all([findAnchors(d.lat, d.lng, radius), lookupTimezone(d.lat, d.lng)]);

    const row = {
        place_id,
        name: d.title,
        archetype,
        area_type: area_type === "office" ? "office" : "residential",
        lat: d.lat,
        lng: d.lng,
        city: city || "Unknown",
        country: country ?? null,
        timezone,
        radius_km: radius,
        leagues: Array.isArray(leagues) ? leagues : [],
        baseline,
        baseline_source: source,
        anchors,
      };
    let { error } = await db().from("places").upsert({ ...row, area: area || null, state: state || null });
    // The `area` column comes from a later migration; keep onboarding working if it has not been run yet.
    if (error && /area|state/.test(error.message)) ({ error } = await db().from("places").upsert(row));
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, place_id, anchors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
