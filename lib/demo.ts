import demo from "../config/demo.json";

/** The demo restaurants (config/demo.json), once `npm run seed-demo` has given them ids. */
export const DEMO_PLACES: { id: string; name: string; where: string }[] = (demo.places as { place_id?: string; name?: string; where?: string }[])
  .filter((p) => p.place_id && p.name)
  .map((p) => ({ id: p.place_id!, name: p.name!, where: p.where ?? "" }));

const IDS = new Set(DEMO_PLACES.map((p) => p.id));
export const isDemo = (place_id: string) => IDS.has(place_id);
