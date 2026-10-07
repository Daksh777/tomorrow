"use client";

import { useState } from "react";
import type { DayPart, Level } from "@/lib/types";

interface Day {
  date: string;
  weekday: string;
  buckets: Partial<Record<DayPart, Level>>;
  pins: number;
}

const GLYPH: Record<Level, string> = { quieter: "▽", usual: "–", busier: "△", "much busier": "▲" };
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
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">This week</h2>
        {!days && (
          <button onClick={load} disabled={loading} className="rounded-full bg-paper px-3 py-1 text-xs font-medium">
            {loading ? "Loading…" : "Show week"}
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-busy">{err}</p>}
      {days && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead>
              <tr>
                <th />
                {days.map((d) => (
                  <th key={d.date} className="px-1 pb-2 font-semibold">
                    {d.weekday.slice(0, 3)}
                    <div className="font-normal text-ink/40">{d.date.slice(8)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PARTS.map((p) => (
                <tr key={p}>
                  <td className="py-1 pr-2 text-left capitalize text-ink/50">{p}</td>
                  {days.map((d) => {
                    const lvl = d.buckets[p];
                    return (
                      <td key={d.date} className="px-1 py-1" title={lvl ?? "closed"}>
                        {lvl ? (
                          <span className={lvl === "quieter" ? "text-quiet" : lvl === "usual" ? "text-ink/40" : "text-busy"}>
                            {GLYPH[lvl]}
                          </span>
                        ) : (
                          <span className="text-ink/20">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink/40">▽ quieter · – usual · △ busier · ▲ much busier</p>
        </div>
      )}
    </section>
  );
}
