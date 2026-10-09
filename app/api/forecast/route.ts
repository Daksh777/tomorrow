import { NextResponse } from "next/server";
import { getCard } from "@/lib/card";
import { buildCard, loadPlace } from "@/lib/build";
import { addDays, localDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const place_id = sp.get("place_id");
  if (!place_id) return NextResponse.json({ error: "place_id is required" }, { status: 400 });

  try {
    if (sp.get("week") === "1") {
      const place = await loadPlace(place_id);
      if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
      const start = localDate(place.timezone, 1);
      const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      const one = async (date: string) => {
        const { forecast } = await buildCard(place, date, false);
        return { date, weekday: forecast.weekday, buckets: forecast.buckets, pins: forecast.pins.length };
      };
      // First day alone fills the shared city caches; the rest then run in parallel without refetching.
      const first = await one(dates[0]);
      const days = [first, ...(await Promise.all(dates.slice(1).map(one)))];
      return NextResponse.json({ days });
    }
    const card = await getCard(place_id, sp.get("date") ?? undefined);
    if (!card) return NextResponse.json({ error: "unknown place" }, { status: 404 });
    const { edit_key_hash, ...place } = card.place;
    return NextResponse.json({ ...card, place: { ...place, locked: !!edit_key_hash } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
