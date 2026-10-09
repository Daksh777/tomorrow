import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dropUpcoming } from "@/lib/invalidate";
import { loadPlace } from "@/lib/build";
import { OWNER_LEVELS } from "@/lib/forecast";
import { canEdit, editKeyFrom, READ_ONLY } from "@/lib/editkey";

export const dynamic = "force-dynamic";

const KINDS = [
  "match_stadium", "match_tv", "event", "rain", "holiday", "disruption", "festival", "payday", "aqi", "dry_day", "long_weekend",
  "hotels", "heat", "competitor", "trend", "exams", "own_event",
];

/** Current per-signal weights for a place, and which ones the owner set by hand. */
export async function GET(req: Request) {
  const place_id = new URL(req.url).searchParams.get("place_id");
  if (!place_id) return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  let { data, error } = await db().from("weights").select("signal_kind, w, owner_set").eq("place_id", place_id);
  if (error) ({ data, error } = (await db().from("weights").select("signal_kind, w").eq("place_id", place_id)) as any); // pre-migration
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const weights = Object.fromEntries((data ?? []).map((r) => [r.signal_kind, { w: r.w, ownerSet: !!r.owner_set }]));
  return NextResponse.json({ weights });
}

/**
 * The owner's override for one signal kind: "none" | "less" | "default" | "more".
 * "default" removes the row (and any tap learning with it). Cards for upcoming days are
 * dropped so they rebuild with the new weight.
 */
export async function PUT(req: Request) {
  const { place_id, kind, level } = await req.json();
  const choice = OWNER_LEVELS.find((l) => l.id === level);
  if (!place_id || !KINDS.includes(kind) || !choice) {
    return NextResponse.json({ error: "place_id, a valid kind and level are required" }, { status: 400 });
  }
  const place = await loadPlace(place_id);
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  if (!canEdit(place, editKeyFrom(req))) return NextResponse.json({ error: READ_ONLY }, { status: 403 });
  const sb = db();

  const q =
    choice.id === "default"
      ? await sb.from("weights").delete().eq("place_id", place_id).eq("signal_kind", kind)
      : await sb.from("weights").upsert({ place_id, signal_kind: kind, w: choice.w, owner_set: true });
  if (q.error) return NextResponse.json({ error: q.error.message }, { status: 502 });

  // Keep today's row: the morning tap still needs it. Later days rebuild on next view.
  await dropUpcoming(place);
  return NextResponse.json({ ok: true, kind, level: choice.id, w: choice.w });
}
