"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { curveGeometry } from "@/lib/curve";
import { scoreDay } from "@/lib/forecast";
import { fmtHour } from "@/lib/time";
import type { Observation } from "@/lib/types";

export interface DayForecast {
  date: string;
  hourly: (number | null)[];
  lo: (number | null)[];
  hi: (number | null)[];
  baseline: (number | null)[];
}

/**
 * Today, scored live: the band we forecast last night, with Google's live readings as dots.
 * Takes a fresh reading on open when the latest is from an earlier hour (one search, at most hourly).
 */
export default function TodayCheck({
  placeId,
  forecast: f,
  observations,
  hourNow,
}: {
  placeId: string;
  forecast: DayForecast;
  observations: Observation[];
  hourNow: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "reading" | "error">("idle");
  const tried = useRef(false);
  const latest = observations.at(-1);
  const openNow = f.baseline[hourNow] != null && (f.baseline[hourNow] as number) > 0;

  useEffect(() => {
    if (tried.current || !openNow || latest?.hour === hourNow) return;
    tried.current = true;
    setState("reading");
    fetch("/api/observe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place_id: placeId }) })
      .then((r) => {
        setState(r.ok ? "idle" : "error");
        if (r.ok) router.refresh();
      })
      .catch(() => setState("error"));
  }, [placeId, hourNow, openNow, latest?.hour, router]);

  const dots = observations.filter((o) => o.live !== null && o.hour >= 6 && o.hour <= 23);
  const g = curveGeometry(f, 360, 120, 8, dots.map((o) => o.live as number));
  const score = scoreDay(f, observations);
  const last = dots.at(-1);

  return (
    <section className="rounded-xl border border-ink/[0.07] bg-surface px-5 pb-4 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Today so far</h2>
        <span className="text-xs text-ink/50" role="status">
          {state === "reading" ? "Reading Google live…" : state === "error" ? "Live reading unavailable" : last ? `Live at ${fmtHour(last.hour)}` : ""}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-ink/60">
        {score
          ? `${score.inside} of ${score.n} live ${score.n === 1 ? "reading" : "readings"} inside last night's forecast range${
              Math.abs(score.meanMiss) >= 0.1 ? `, running ${Math.round(Math.abs(score.meanMiss) * 100)}% ${score.meanMiss > 0 ? "busier" : "quieter"}` : ""
            }.`
          : dots.length
            ? "Live readings so far are in hours too quiet to score."
            : "Google's live busyness, checked against the forecast we made last night."}
      </p>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="mt-3 w-full text-ink" role="img" aria-label="Today's forecast with live readings">
        <path d={g.band} fill="rgb(var(--band))" style={{ fillOpacity: "var(--band-alpha)" }} />
        <path d={g.forecast} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.5} />
        {hourNow >= 6 && <line x1={g.x(hourNow)} x2={g.x(hourNow)} y1={4} y2={g.height - 14} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="2 3" />}
        {dots.map((o) => {
          const inside = o.live! >= (f.lo[o.hour] ?? 0) && o.live! <= (f.hi[o.hour] ?? Infinity);
          return (
            <circle
              key={o.hour}
              cx={g.x(o.hour)}
              cy={g.y(o.live!)}
              r={4}
              fill={inside ? "rgb(var(--ink))" : "rgb(var(--busy))"}
              stroke="rgb(var(--surface))"
              strokeWidth={1.5}
            >
              <title>{`${fmtHour(o.hour)}: live ${o.live}, forecast ${Math.round(f.hourly[o.hour] ?? 0)}`}</title>
            </circle>
          );
        })}
        {g.ticks.map((t) => (
          <text key={t.h} x={t.x} y={g.height - 1} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.45} className="font-mono">
            {t.label}
          </text>
        ))}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/55">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm bg-band/40" />
          Our forecast range
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-ink" />
          Google live, in range
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-busy" />
          Google live, out of range
        </span>
      </div>
    </section>
  );
}
