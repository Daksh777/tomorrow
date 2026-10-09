import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadPlace } from "@/lib/build";

export const dynamic = "force-dynamic";

/**
 * Follow a place's card on this phone (Web Push). Anyone who can read the card may follow it, so
 * staff can get it too; following never changes the forecast, so no edit key is needed.
 */
export async function POST(req: Request) {
  const { place_id, subscription } = await req.json().catch(() => ({}));
  if (!place_id || !subscription?.endpoint) return NextResponse.json({ error: "place_id and subscription are required" }, { status: 400 });
  if (!(await loadPlace(place_id))) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  const { error } = await db().from("push_subscriptions").upsert({ endpoint: subscription.endpoint, place_id, subscription });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
