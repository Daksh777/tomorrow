import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadPlace } from "@/lib/build";
import { canEdit, editKeyFrom, READ_ONLY } from "@/lib/editkey";
import { LANGUAGES, asUnit } from "@/lib/languages";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Language and "usual day" numbers. Upcoming cards are dropped so they rebuild in the new words. */
export async function PATCH(req: Request) {
  const { place_id, language, usual_daily, unit } = await req.json().catch(() => ({}));
  const place = place_id ? await loadPlace(place_id) : null;
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  if (!canEdit(place, editKeyFrom(req))) return NextResponse.json({ error: READ_ONLY }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (language !== undefined) {
    if (!(language in LANGUAGES)) return NextResponse.json({ error: "unknown language" }, { status: 400 });
    patch.language = language;
  }
  if (usual_daily !== undefined) patch.usual_daily = Number(usual_daily) > 0 ? Math.round(Number(usual_daily)) : null;
  if (unit !== undefined) patch.unit = asUnit(unit);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to change" }, { status: 400 });

  const sb = db();
  const { error } = await sb.from("places").update(patch).eq("place_id", place_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await sb.from("forecasts").delete().eq("place_id", place_id).gt("date", localDate(place.timezone));
  return NextResponse.json({ ok: true });
}
