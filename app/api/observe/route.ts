import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadPlace } from "@/lib/build";
import { observeNow } from "@/lib/observe";
import type { Place } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Take Google's live reading (one SerpApi call per place, at most once per local hour).
 * GET is the cron (every place, CRON_SECRET); POST { place_id } is the card's "Check now" button.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data } = await db().from("places").select("*");
  const read: { place_id: string; live: number | null }[] = [];
  const failed: { place_id: string; error: string }[] = [];
  await Promise.all(
    ((data ?? []) as Place[]).map(async (p) => {
      try {
        const o = await observeNow(p);
        read.push({ place_id: p.place_id, live: o?.live ?? null });
      } catch (e: any) {
        failed.push({ place_id: p.place_id, error: e.message });
      }
    }),
  );
  return NextResponse.json({ read, failed });
}

export async function POST(req: Request) {
  const { place_id } = await req.json().catch(() => ({}));
  const place = place_id ? await loadPlace(place_id) : null;
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, observation: await observeNow(place) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
