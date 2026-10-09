import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canEdit, editKeyFrom } from "@/lib/editkey";
import { ARCHETYPES, savePlace } from "@/lib/onboard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Onboarding steps 4 to 6: save the place with the owner's choices, then the card is built on first view.
 * The first phone to set a place up gets its edit key. If the place already has a key and this phone
 * doesn't hold it, nothing is overwritten: the phone gets a read-only card.
 */
export async function POST(req: Request) {
  const b = await req.json();
  const { place_id, archetype } = b;
  if (!place_id || !ARCHETYPES.includes(archetype)) {
    return NextResponse.json({ error: "place_id and a valid archetype are required" }, { status: 400 });
  }
  try {
    const { data: existing } = await db().from("places").select("place_id, edit_key_hash").eq("place_id", place_id).maybeSingle();
    if (existing?.edit_key_hash && !canEdit(existing, editKeyFrom(req))) {
      return NextResponse.json({ ok: true, place_id, readOnly: true });
    }
    // A new place gets a key; re-onboarding with the key keeps the old one.
    const { anchors, editKey } = await savePlace(b, { withKey: !existing?.edit_key_hash });
    return NextResponse.json({ ok: true, place_id, anchors, ...(editKey ? { editKey } : {}) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
  }
}
