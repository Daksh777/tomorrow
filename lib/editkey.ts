import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Place } from "./types";

/**
 * No accounts. The phone that sets a place up gets a random edit key (kept in its localStorage) and
 * the server stores only its hash. Taps, weight changes and settings need the key, so a stranger
 * with the link can read the card but cannot retrain it. Places set up before keys existed stay open.
 */
export function newEditKey(): { key: string; hash: string } {
  const key = randomBytes(18).toString("base64url");
  return { key, hash: hashKey(key) };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function canEdit(place: Pick<Place, "edit_key_hash">, key: string | null | undefined): boolean {
  if (!place.edit_key_hash) return true;
  if (!key) return false;
  const a = Buffer.from(hashKey(key), "hex");
  const b = Buffer.from(place.edit_key_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The key travels in a header so it never lands in a URL or a server log. */
export function editKeyFrom(req: Request): string | null {
  return req.headers.get("x-edit-key");
}

export const READ_ONLY = "Only the phone that set up this place can change it.";
