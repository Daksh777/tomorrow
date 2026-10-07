import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildCard } from "@/lib/build";
import { localDate, localHour } from "@/lib/time";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron, hourly. Builds the card for every place whose local time is 18:00,
 * so it is ready when the owner opens the app at 19:00.
 * City-level signals are cached, so cost scales by city, not by business.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = new URL(req.url).searchParams.get("force") === "1";

  const { data } = await db().from("places").select("*");
  const built: string[] = [];
  const failed: { place_id: string; error: string }[] = [];

  for (const place of (data ?? []) as Place[]) {
    if (!force && localHour(place.timezone) !== 18) continue;
    try {
      await buildCard(place, localDate(place.timezone, 1));
      built.push(place.place_id);
    } catch (e: any) {
      failed.push({ place_id: place.place_id, error: e.message });
    }
  }
  return NextResponse.json({ built, failed });
}
