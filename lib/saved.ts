/**
 * The places this phone follows, kept in localStorage (no accounts) and listed on the home page.
 * Browser only.
 */
export interface SavedPlace {
  id: string;
  name: string;
  /** "Connaught Place, New Delhi", shown under the name. */
  where?: string;
}

const LIST = "tomorrow.places";
/** Fired on window whenever the list changes, so the top bar and the home cards stay in step. */
export const PLACES_EVENT = "tomorrow-places";
const changed = () => window.dispatchEvent(new Event(PLACES_EVENT));
const LEGACY = "tomorrow.place_id"; // the single saved place, before the list existed

export function savedPlaces(): SavedPlace[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST) ?? "[]");
    const list: SavedPlace[] = Array.isArray(raw) ? raw.filter((p) => p && typeof p.id === "string" && typeof p.name === "string") : [];
    const legacy = localStorage.getItem(LEGACY);
    if (legacy && !list.some((p) => p.id === legacy)) list.push({ id: legacy, name: "Your place" });
    return list;
  } catch {
    return [];
  }
}

/** Remember a place (or refresh its name), most recently opened first. */
export function rememberPlace(p: SavedPlace): void {
  try {
    const rest = savedPlaces().filter((x) => x.id !== p.id);
    localStorage.setItem(LIST, JSON.stringify([p, ...rest].slice(0, 10)));
    localStorage.removeItem(LEGACY);
    changed();
  } catch {
    /* private mode: the app still works, it just won't remember */
  }
}

export function forgetPlace(id: string): SavedPlace[] {
  try {
    const rest = savedPlaces().filter((x) => x.id !== id);
    localStorage.setItem(LIST, JSON.stringify(rest));
    if (localStorage.getItem(LEGACY) === id) localStorage.removeItem(LEGACY);
    changed();
    return rest;
  } catch {
    return [];
  }
}
