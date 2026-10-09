import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadPlace } from "@/lib/build";
import { canEdit, editKeyFrom, READ_ONLY } from "@/lib/editkey";
import { dropUpcoming } from "@/lib/invalidate";
import { ownerEvents } from "@/lib/ownerEvents";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const LEVELS = ["quieter", "busier", "much_busier"];

export async function GET(req: Request) {
  const place_id = new URL(req.url).searchParams.get("place_id");
  if (!place_id) return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  return NextResponse.json({ events: await ownerEvents(place_id) });
}

/** Add a plan: { place_id, date, start_hour, end_hour, label, level, weekly }. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const place = b.place_id ? await loadPlace(b.place_id) : null;
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  if (!canEdit(place, editKeyFrom(req))) return NextResponse.json({ error: READ_ONLY }, { status: 403 });

  const label = typeof b.label === "string" ? b.label.trim().slice(0, 60) : "";
  const start = Number(b.start_hour);
  const end = Number(b.end_hour);
  const today = localDate(place.timezone);
  if (!label) return NextResponse.json({ error: "Give it a name" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") || b.date < today) return NextResponse.json({ error: "Pick today or a later date" }, { status: 400 });
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end <= start || end > 30) {
    return NextResponse.json({ error: "The end time must be after the start time" }, { status: 400 });
  }
  if (!LEVELS.includes(b.level)) return NextResponse.json({ error: "Pick quieter, busier or much busier" }, { status: 400 });

  const { data, error } = await db()
    .from("owner_events")
    .insert({ place_id: place.place_id, date: b.date, weekly: !!b.weekly, start_hour: start, end_hour: end, label, level: b.level })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await dropUpcoming(place);
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const { place_id, id } = await req.json().catch(() => ({}));
  const place = place_id ? await loadPlace(place_id) : null;
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  if (!canEdit(place, editKeyFrom(req))) return NextResponse.json({ error: READ_ONLY }, { status: 403 });
  const { error } = await db().from("owner_events").delete().eq("place_id", place_id).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await dropUpcoming(place);
  return NextResponse.json({ ok: true });
}
