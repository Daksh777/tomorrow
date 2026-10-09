import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchPlaceDetails, findAnchors, lookupTimezone, peerBaseline } from "@/lib/place";
import { canEdit, editKeyFrom, newEditKey } from "@/lib/editkey";
import { recordObservation } from "@/lib/observe";
import { LANGUAGES, asUnit } from "@/lib/languages";
import type { Archetype } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ARCHETYPES: Archetype[] = ["cafe", "restaurant", "bar", "quick_service", "cloud_kitchen", "retail", "salon"];

/**
 * Onboarding steps 4 to 6: save the place with the owner's choices, then the card is built on first view.
 * The first phone to set a place up gets its edit key. If the place already has a key and this phone
 * doesn't hold it, nothing is overwritten: the phone gets a read-only card.
 */
export async function POST(req: Request) {
  const b = await req.json();
  const { place_id, archetype, area_type, radius_km, leagues, city, country, area, state, usual_daily, unit, language } = b;
  if (!place_id || !ARCHETYPES.includes(archetype)) {
    return NextResponse.json({ error: "place_id and a valid archetype are required" }, { status: 400 });
  }
  try {
    const { data: existing } = await db().from("places").select("place_id, edit_key_hash").eq("place_id", place_id).maybeSingle();
    if (existing?.edit_key_hash && !canEdit(existing, editKeyFrom(req))) {
      return NextResponse.json({ ok: true, place_id, readOnly: true });
    }

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
    // A new place gets a key; re-onboarding with the key keeps the old one.
    const key = existing?.edit_key_hash ? null : newEditKey();
    const extra = {
      area: area || null,
      state: state || null,
      usual_daily: Number(usual_daily) > 0 ? Math.round(Number(usual_daily)) : null,
      unit: Number(usual_daily) > 0 ? asUnit(unit) : null,
      language: language in LANGUAGES ? language : "en",
      ...(key ? { edit_key_hash: key.hash } : {}),
    };
    let { error } = await db().from("places").upsert({ ...row, ...extra });
    // Later migrations add these columns; keep onboarding working if they have not been run yet.
    if (error && /area|state|usual_daily|unit|language|edit_key_hash/.test(error.message)) ({ error } = await db().from("places").upsert(row));
    if (error) throw new Error(error.message);

    // The details call already carries a live reading and the review count: keep them.
    await recordObservation({ place_id, timezone }, d.live, d.reviews).catch(() => null);
    return NextResponse.json({ ok: true, place_id, anchors, ...(key ? { editKey: key.key } : {}) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
