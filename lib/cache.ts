import { db } from "./db";

/**
 * City-level cache. Shared by every business in a city:
 * key = (city, date, kind). Per-business calls never go through here.
 */
export async function cached<T>(
  city: string,
  date: string,
  kind: string,
  maxAgeHours: number,
  fetcher: () => Promise<T>,
): Promise<T> {
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
}
