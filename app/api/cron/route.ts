import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildCard } from "@/lib/build";
import { pushCard } from "@/lib/push";
import { localDate, localHour } from "@/lib/time";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Local hours in which a missing card for tomorrow gets built. */
const BUILD_FROM = 17;

/**
 * Vercel Cron. Builds tomorrow's card for every place whose local time is 17:00 or later and that has
 * no card for tomorrow yet, then pushes the headline to phones following it. That works hourly (each
 * place is built once, at its first run after 17:00) and daily (vercel.json runs it at 18:00 IST).
 * Cities build in parallel; places within a city run one after another, so the first fills the
 * city's caches and the rest reuse them. `?force=1` rebuilds everything now.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";

  const sb = db();
  const { data } = await sb.from("places").select("*");
  const places = (data ?? []) as Place[];

  const due: Place[] = [];
  for (const p of places) {
    if (force) {
      due.push(p);
      continue;
    }
    if (localHour(p.timezone) < BUILD_FROM) continue;
    const { data: have } = await sb.from("forecasts").select("date").eq("place_id", p.place_id).eq("date", localDate(p.timezone, 1)).maybeSingle();
    if (!have) due.push(p);
  }

  const byCity = new Map<string, Place[]>();
  for (const p of due) (byCity.get(p.city) ?? byCity.set(p.city, []).get(p.city)!).push(p);

  const built: string[] = [];
  const failed: { place_id: string; error: string }[] = [];
  let pushed = 0;
  await Promise.all(
    [...byCity.values()].map(async (list) => {
      for (const place of list) {
        try {
          const card = await buildCard(place, localDate(place.timezone, 1));
          built.push(place.place_id);
          pushed += await pushCard(place.place_id, place.name, card.copy).catch(() => 0);
        } catch (e: any) {
          failed.push({ place_id: place.place_id, error: e.message });
        }
      }
    }),
  );
  return NextResponse.json({ built, failed, pushed });
}
