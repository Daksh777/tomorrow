import Link from "next/link";
import { db } from "@/lib/db";
import { liveHistory, loadPlace, loadWeightRows, pooledWeights } from "@/lib/build";
import { usualCorrection } from "@/lib/correction";
import { KIND_NAME } from "@/lib/kinds";
import { addDays, localDate, weekdayOf } from "@/lib/time";
import effects from "@/config/effects.json";
import TopBar from "@/components/TopBar";
import type { DayPart, Pin, SignalKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const PART: Record<DayPart, string> = { morning: "Mornings", lunch: "Lunch", afternoon: "Afternoons", evening: "Evenings", late: "Late nights" };
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;

/** How sure we are about a signal's weight, from the days the owner told us about. */
function confidence(taught: number): { label: string; cls: string } {
  if (taught >= 6) return { label: "Sure", cls: "text-ink" };
  if (taught >= 2) return { label: "Getting there", cls: "text-ink/70" };
  return { label: "Not enough days yet", cls: "text-ink/45" };
}

/**
 * What moves your place: for every signal that has shown up on this place's cards, how strong it is
 * now against our starting guess, where that came from (your taps, your own setting, places like yours),
 * and how sure we are. Plus how the place runs against Google's usual curve, from live readings.
 */
export default async function MovesPage({ params }: { params: Promise<{ placeId: string }> }) {
  const placeId = decodeURIComponent((await params).placeId);
  const place = await loadPlace(placeId);
  if (!place) return <p className="mt-10 text-sm">We don&apos;t know that place yet.</p>;

  const today = localDate(place.timezone);
  const [{ weights, ownerSet }, pooled, { data: cards }, { data: taps }, history] = await Promise.all([
    loadWeightRows(placeId),
    pooledWeights(place).catch(() => ({})),
    db().from("forecasts").select("date, pins").eq("place_id", placeId).gte("date", addDays(today, -120)).lte("date", addDays(today, 7)),
    db().from("taps").select("date").eq("place_id", placeId),
    liveHistory(place).catch(() => ({ obs: [], cards: [] })),
  ]);
  const tapped = new Set((taps ?? []).map((t: any) => t.date));

  const seen = new Map<SignalKind, { days: number; taught: number; effects: number[] }>();
  for (const c of cards ?? []) {
    const kinds = new Map<SignalKind, number>();
    for (const p of (c.pins ?? []) as Pin[]) if (Math.abs(p.effect) > Math.abs(kinds.get(p.kind) ?? 0)) kinds.set(p.kind, p.effect);
    for (const [k, e] of kinds) {
      const row = seen.get(k) ?? { days: 0, taught: 0, effects: [] };
      row.days++;
      if (tapped.has(c.date)) row.taught++;
      row.effects.push(e);
      seen.set(k, row);
    }
  }
  for (const k of Object.keys(weights) as SignalKind[]) if (!seen.has(k)) seen.set(k, { days: 0, taught: 0, effects: [] });

  const table = (effects.archetypes as Record<string, Record<string, number>>)[place.archetype] ?? {};
  const rows = [...seen.entries()]
    .map(([kind, s]) => {
      const own = weights[kind];
      const pool = (pooled as Record<string, number>)[kind];
      const w = own ?? pool ?? 1;
      const source = ownerSet.includes(kind)
        ? "You set this"
        : own !== undefined
          ? "Learned from your taps"
          : pool !== undefined
            ? "Learned from places like yours"
            : "Our starting guess";
      // Effect when it happens: the archetype table where there is one, else the median of past pins.
      const sorted = [...s.effects].sort((a, b) => a - b);
      const typical = table[kind] !== undefined ? table[kind] * w : sorted.length ? sorted[sorted.length >> 1] : null;
      return { kind, w, source, typical, ...s };
    })
    .sort((a, b) => Math.abs(b.typical ?? 0) - Math.abs(a.typical ?? 0));

  const correction = usualCorrection(history.obs, Object.fromEntries(history.cards.map((c) => [c.date, c.pins])), weekdayOf(today));
  const readings = history.obs.filter((o) => o.live !== null).length;

  return (
    <main>
      <TopBar current={{ id: placeId, name: place.name, where: [place.area, place.city].filter(Boolean).join(", ") }} />
      <Link href={`/p/${encodeURIComponent(placeId)}`} className="text-sm font-medium text-ink/55">
        ← Tomorrow&apos;s card
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">What moves {place.name}</h1>
      <p className="mt-1 text-sm text-ink/60">
        Learned from {tapped.size} {tapped.size === 1 ? "morning tap" : "morning taps"} and {readings} Google live {readings === 1 ? "reading" : "readings"}.
      </p>

      <section className="mt-4 rounded-xl border border-ink/[0.07] bg-surface px-5 py-2">
        {rows.length === 0 && <p className="py-3 text-sm text-ink/55">Nothing has shown up on your cards yet.</p>}
        <ul>
          {rows.map((r) => {
            const conf = confidence(r.taught);
            const same = Math.abs(r.w - 1) < 0.05;
            const what = r.source === "Our starting guess" ? "Our starting guess" : same ? `${r.source}: same as our first guess` : r.w === 0 ? `${r.source}: switched off` : `${r.source}: ${r.w.toFixed(1)}× our first guess`;
            return (
              <li key={r.kind} className="border-b border-ink/[0.07] py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium">{KIND_NAME[r.kind]}</span>
                  {r.typical !== null && (
                    <span className={`shrink-0 font-mono text-sm tabular ${r.typical > 0 ? "text-busy" : r.typical < 0 ? "text-quiet" : "text-ink/40"}`}>
                      {pct(r.typical)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-ink/55">
                  <span>
                    {what}. On {r.days} {r.days === 1 ? "card" : "cards"}.
                  </span>
                  <span className={conf.cls}>{conf.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-3 rounded-xl border border-ink/[0.07] bg-surface p-5">
        <h2 className="text-base font-semibold">Against Google&apos;s usual curve</h2>
        {Object.keys(correction).length ? (
          <>
            <p className="mt-0.5 text-sm text-ink/60">From live readings on ordinary hours (no match, event or rain). Your card&apos;s usual line already includes this.</p>
            <ul className="mt-2">
              {(Object.entries(correction) as [DayPart, { factor: number; n: number }][]).map(([p, c]) => (
                <li key={p} className="flex items-baseline justify-between border-b border-ink/[0.07] py-2 text-[15px] last:border-b-0">
                  <span>
                    {PART[p]} run {c.factor < 1 ? "quieter" : "busier"}
                  </span>
                  <span className="font-mono text-sm tabular text-ink/70">
                    {pct(c.factor - 1)} <span className="text-ink/40">· {c.n} readings</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-ink/60">
            Not enough live readings yet (we need 3 for a part of the day). Each time you open the card we take one, at most hourly, and once more every evening.
          </p>
        )}
      </section>
    </main>
  );
}
