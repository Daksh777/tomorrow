import { NextResponse } from "next/server";
import { loadPlace } from "@/lib/build";
import { canEdit, editKeyFrom, READ_ONLY } from "@/lib/editkey";
import { applyTap } from "@/lib/learn";

export const dynamic = "force-dynamic";

/** The morning tap. The learning itself is in lib/learn.ts. */
export async function POST(req: Request) {
  const { place_id, date, value, daypart } = await req.json();
  if (!place_id || !date || ![-1, 0, 1].includes(value)) {
    return NextResponse.json({ error: "place_id, date and value (-1|0|1) are required" }, { status: 400 });
  }
  const place = await loadPlace(place_id);
  if (!place) return NextResponse.json({ error: "unknown place" }, { status: 404 });
  if (!canEdit(place, editKeyFrom(req))) return NextResponse.json({ error: READ_ONLY }, { status: 403 });
  const r = await applyTap(place, date, value, daypart);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
