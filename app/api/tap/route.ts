import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWeights, type Weights } from "@/lib/forecast";

export const dynamic = "force-dynamic";

/**
 * The morning tap: quieter -1, as expected 0, busier +1.
 * One tap per place per day; re-tapping replaces the day's tap without double-training.
 */
export async function POST(req: Request) {
  const { place_id, date, value, daypart } = await req.json();
  if (!place_id || !date || ![-1, 0, 1].includes(value)) {
    return NextResponse.json({ error: "place_id, date and value (-1|0|1) are required" }, { status: 400 });
  }
  const sb = db();

  const { data: existing } = await sb.from("taps").select("value").eq("place_id", place_id).eq("date", date).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, alreadyTapped: true });

  const { data: fc } = await sb.from("forecasts").select("pins").eq("place_id", place_id).eq("date", date).maybeSingle();
  if (!fc) return NextResponse.json({ error: "no forecast was made for that day" }, { status: 404 });

  const { data: rows } = await sb.from("weights").select("signal_kind, w").eq("place_id", place_id);
  const before: Weights = {};
  for (const r of rows ?? []) before[r.signal_kind as keyof Weights] = r.w;

  const active = (fc.pins as { kind: any; effect: number }[]).map((p) => ({ kind: p.kind, effect: p.effect }));
  const after = updateWeights(before, active, value);

  await sb.from("taps").insert({ place_id, date, value, daypart: daypart ?? null });
  const up = Object.entries(after).map(([signal_kind, w]) => ({ place_id, signal_kind, w }));
  if (up.length) await sb.from("weights").upsert(up);

  const changed = Object.fromEntries(
    Object.keys(after)
      .filter((k) => after[k as keyof Weights] !== (before[k as keyof Weights] ?? 1))
      .map((k) => [k, { from: before[k as keyof Weights] ?? 1, to: after[k as keyof Weights] }]),
  );
  return NextResponse.json({ ok: true, changed });
}
