"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { curveGeometry } from "@/lib/curve";
import { fmtHour } from "@/lib/time";
import { OWNER_LEVELS } from "@/lib/forecast";
import type { Copy, Forecast, Level, SignalKind } from "@/lib/types";

const KIND_PHRASE: Record<SignalKind, string> = {
  match_stadium: "a match at a stadium near you",
  match_tv: "a big match on TV",
  event: "an event nearby",
  rain: "rain",
  holiday: "a public holiday",
  disruption: "a strike or road closure",
  festival: "a festival like this",
  payday: "the salary cycle (payday week and month-end)",
  aqi: "bad air quality",
  dry_day: "a dry day",
  long_weekend: "a long weekend or bridge day",
};

type WeightInfo = Record<string, { w: number; ownerSet: boolean }>;

const LEVEL_COLOR: Record<Level, string> = {
  quieter: "text-quiet",
  usual: "text-ink/60",
  busier: "text-busy",
  "much busier": "text-busy font-bold",
};
const PART_NAME: Record<string, string> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  evening: "Evening",
  late: "Late",
};

export default function EveningCard({
  placeName,
  placeId,
  forecast: f,
  copy,
  warnings,
}: {
  placeName: string;
  placeId: string;
  forecast: Forecast;
  copy: Copy;
  warnings: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [weights, setWeights] = useState<WeightInfo>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/weights?place_id=${encodeURIComponent(placeId)}`)
      .then((r) => (r.ok ? r.json() : { weights: {} }))
      .then((j) => setWeights(j.weights ?? {}))
      .catch(() => {});
  }, [placeId]);

  async function setLevel(kind: SignalKind, level: string) {
    setSaving(true);
    const r = await fetch("/api/weights", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ place_id: placeId, kind, level }),
    });
    setSaving(false);
    if (!r.ok) return;
    const w = OWNER_LEVELS.find((l) => l.id === level)!.w;
    setWeights((prev) => {
      const next = { ...prev };
      if (level === "default") delete next[kind];
      else next[kind] = { w, ownerSet: true };
      return next;
    });
    router.refresh(); // the card rebuilds with the new weight
  }
  const g = curveGeometry(f, 360, 170);
  const day = f.weekday[0].toUpperCase() + f.weekday.slice(1);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-ink/50">
        {placeName} · {day}
      </div>
      <h1 className="mt-2 text-2xl font-bold leading-tight">{copy.headline}</h1>

      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="mt-4 w-full" role="img" aria-label="Tomorrow's busyness curve">
        <path d={g.band} fill="#e8a33d" fillOpacity={0.3} />
        <path d={g.baseline} fill="none" stroke="#9ca3af" strokeWidth={1.5} />
        <path d={g.forecast} fill="none" stroke="#14181f" strokeWidth={2.5} />
        {g.ticks.map((t) => (
          <text key={t.h} x={t.x} y={g.height - 1} fontSize={9} textAnchor="middle" fill="#6b7280">
            {t.label}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-ink/50">
        <span>— your usual {day}</span>
        <span className="text-band">▮ tomorrow (wider = less sure)</span>
      </div>

      {f.baselineSource === "peers" && (
        <p className="mt-2 text-xs text-ink/50">Based on places like yours.</p>
      )}

      <ul className="mt-4 space-y-2">
        {f.pins.map((p, i) => (
          <li key={i}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-start gap-2 rounded-lg bg-paper px-3 py-2 text-left text-sm"
            >
              <span className={p.effect > 0 ? "text-busy" : p.effect < 0 ? "text-quiet" : "text-ink/40"}>{p.effect > 0 ? "▲" : p.effect < 0 ? "▼" : "–"}</span>
              <span className="flex-1">
                {p.label}
                {p.distanceKm !== null && (
                  <span className="text-ink/50"> · {Math.round(p.distanceKm * 1000)} m</span>
                )}
              </span>
            </button>
            {open === i && (
              <div className="mx-3 mt-1 rounded-lg border border-ink/10 px-3 py-2 text-xs text-ink/70">
                <div>Source: {p.source}</div>
                {p.detail && <div>{p.detail}</div>}
                {p.distanceKm !== null && <div>Distance: {p.distanceKm.toFixed(1)} km from you</div>}
                <div>
                  Window: {fmtHour(p.startHour)} to {fmtHour(p.endHour)}
                </div>
                <WeightPicker
                  phrase={KIND_PHRASE[p.kind]}
                  info={weights[p.kind]}
                  disabled={saving}
                  onPick={(level) => setLevel(p.kind, level)}
                />
              </div>
            )}
          </li>
        ))}
        {!f.pins.length && <li className="text-sm text-ink/60">Nothing nearby is likely to move your crowd.</li>}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(f.buckets).map(([part, lvl]) => (
          <span key={part} className="rounded-full bg-paper px-3 py-1 text-xs">
            {PART_NAME[part]}: <span className={LEVEL_COLOR[lvl as Level]}>{lvl}</span>
          </span>
        ))}
      </div>

      <ol className="mt-5 space-y-2 border-t border-ink/10 pt-4 text-base font-medium">
        {copy.actions.map((a, i) => (
          <li key={i}>
            {i + 1}. {a}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between text-xs text-ink/50">
        <span>{f.tuned ? "Tuned to your place" : `Learning your place (${f.taps}/7 taps)`}</span>
        <a
          href={`/api/share?place_id=${encodeURIComponent(placeId)}&date=${f.date}`}
          target="_blank"
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          Share to staff
        </a>
      </div>

      {warnings.length > 0 && (
        <p className="mt-3 text-xs text-ink/40">Some sources were unavailable: {warnings.map((w) => w.split(":")[0]).join(", ")}.</p>
      )}
    </section>
  );
}

/** "How much does X move you?" in words. Applies to every future signal of that kind. */
function WeightPicker({
  phrase,
  info,
  disabled,
  onPick,
}: {
  phrase: string;
  info: { w: number; ownerSet: boolean } | undefined;
  disabled: boolean;
  onPick: (level: string) => void;
}) {
  const current = info?.ownerSet ? OWNER_LEVELS.reduce((a, b) => (Math.abs(b.w - info.w) < Math.abs(a.w - info.w) ? b : a)).id : "default";
  return (
    <div className="mt-3 border-t border-ink/10 pt-2">
      <div className="font-medium text-ink">How much does {phrase} move your place?</div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {OWNER_LEVELS.map((l) => (
          <button
            key={l.id}
            disabled={disabled}
            onClick={() => onPick(l.id)}
            className={`rounded-lg px-1 py-2 text-[11px] font-medium ${current === l.id ? "bg-ink text-paper" : "bg-paper"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-ink/50">
        {info?.ownerSet
          ? "You set this. It widens the range a little."
          : info
            ? `Tuned by your taps (${info.w.toFixed(1)}×).`
            : "Default. Your morning taps adjust it over time."}
      </div>
    </div>
  );
}
