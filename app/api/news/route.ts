import { NextResponse } from "next/server";
import { buildCard, loadPlace } from "@/lib/build";
import { NEWS_RECHECK_HOURS, newsCheckedAt } from "@/lib/signals/news";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Check news again": refetch this city's news (unless it was fetched in the last 15 minutes) and
 * rebuild tomorrow's card. Weather, matches and events stay cached, so a press costs one or two searches.
 */
export async function POST(req: Request) {
  const { place_id } = await req.json().catch(() => ({}));
  if (!place_id) return NextResponse.json({ error: "place_id is required" }, { status: 400 });
  const place = await loadPlace(place_id);
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  try {
    const card = await buildCard(place, localDate(place.timezone, 1), true, { newsMaxAgeHours: NEWS_RECHECK_HOURS });
    const failed = card.warnings.find((w) => w.startsWith("news:"));
    if (failed) return NextResponse.json({ error: "Could not reach the news right now." }, { status: 502 });
    return NextResponse.json({ ok: true, checkedAt: await newsCheckedAt(place.city) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
