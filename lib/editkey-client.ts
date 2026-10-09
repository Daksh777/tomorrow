/** Browser side of the edit key (lib/editkey.ts): one key per place, in localStorage. */
const KEYS = "tomorrow.keys";

function all(): Record<string, string> {
  try {
    const j = JSON.parse(localStorage.getItem(KEYS) ?? "{}");
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

export function editKeyFor(placeId: string): string | null {
  return all()[placeId] ?? null;
}

export function saveEditKey(placeId: string, key: string): void {
  try {
    localStorage.setItem(KEYS, JSON.stringify({ ...all(), [placeId]: key }));
  } catch {
    /* private mode: edits will be refused, reading still works */
  }
}

/** Headers for a write to this place's API. */
export function editHeaders(placeId: string): Record<string, string> {
  const k = editKeyFor(placeId);
  return { "content-type": "application/json", ...(k ? { "x-edit-key": k } : {}) };
}
