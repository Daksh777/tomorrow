import { db } from "./db";

/** Fetches in flight in this server process, so two cards building at once share one search. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Signal cache, key = (city, date, kind). City-level signals are shared by every business in a city;
 * the few per-place ones (nearby places) use "place:<place_id>" as the city, and India-wide ones "india".
 */
export async function cached<T>(
  city: string,
  date: string,
  kind: string,
  maxAgeHours: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = `${city}|${date}|${kind}|${maxAgeHours}`;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = (async () => {
    const sb = db();
    const { data } = await sb
      .from("signal_cache")
      .select("payload, fetched_at")
      .eq("city", city)
      .eq("date", date)
      .eq("kind", kind)
      .maybeSingle();

    if (data) {
      const ageH = (Date.now() - new Date(data.fetched_at).getTime()) / 36e5;
      if (ageH < maxAgeHours) return data.payload as T;
    }

    const payload = await fetcher();
    await sb
      .from("signal_cache")
      .upsert({ city, date, kind, payload, fetched_at: new Date().toISOString() });
    return payload;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}
