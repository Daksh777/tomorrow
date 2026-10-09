"use client";

import { useState } from "react";
import type { DayPart, Level } from "@/lib/types";

interface Day {
  date: string;
  weekday: string;
  buckets: Partial<Record<DayPart, Level>>;
  pins: number;
}

/** Bar height and colour per level, so the week reads at a glance like a rain chart. */
const BAR: Record<Level, string> = {
  quieter: "h-1.5 bg-quiet",
  usual: "h-2.5 bg-ink/25",
  busier: "h-4 bg-busy/80",
  "much busier": "h-5 bg-busy",
};
const PARTS: DayPart[] = ["morning", "lunch", "afternoon", "evening", "late"];

/** Seven columns like a weather app, one word per day part. Loaded on demand. */
export default function WeekStrip({ placeId }: { placeId: string }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/forecast?place_id=${encodeURIComponent(placeId)}&week=1`);
    const j = await r.json();
    if (!r.ok) setErr(j.error ?? "Could not load the week");
    else setDays(j.days);
    setLoading(false);
  }

  return (
    <section className="mt-3 rounded-xl border border-ink/[0.07] bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">This week</h2>
        {!days && (
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-paper px-3 py-1.5 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Loading…" : "Show week"}
          </button>
        )}
      </div>
      {loading && !days && <div aria-hidden className="mt-4 h-36 animate-pulse rounded-lg bg-ink/[0.05]" />}
      {err && <p className="mt-2 text-xs text-busy">{err}</p>}
      {days && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-center text-xs tabular">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d.date} className="px-1 pb-2 font-medium capitalize">
                    {d.weekday.slice(0, 3)}
                    <div className="font-mono font-normal text-ink/40">{d.date.slice(8)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PARTS.map((p) => (
                <tr key={p}>
                  <td className="py-1.5 pr-2 text-left capitalize text-ink/50">{p}</td>
                  {days.map((d) => {
                    const lvl = d.buckets[p];
                    return (
                      <td key={d.date} className="px-1 py-1.5" title={lvl ?? "closed"}>
                        <div className="flex h-5 items-end justify-center">
                          {lvl ? <span className={`w-3 rounded-sm ${BAR[lvl]}`} /> : <span className="h-px w-3 bg-ink/15" />}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/50">
            {(Object.keys(BAR) as Level[]).map((l) => (
              <span key={l} className="flex items-end gap-1.5">
                <span className={`w-2 rounded-sm ${BAR[l]}`} />
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
