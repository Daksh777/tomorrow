"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpRight, CaretDown, Minus } from "@phosphor-icons/react";
import { curveGeometry } from "@/lib/curve";
import { fmtHour } from "@/lib/time";
import { OWNER_LEVELS, dayRatio } from "@/lib/forecast";
import { editHeaders, editKeyFor } from "@/lib/editkey-client";
import PushButton from "./PushButton";
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
  hotels: "a jump in hotel prices (visitors arriving)",
  heat: "a hot afternoon",
  competitor: "a nearby place being closed",
  trend: "how fast your reviews are coming in",
  exams: "exam season",
};

type WeightInfo = Record<string, { w: number; ownerSet: boolean }>;

const LEVEL_COLOR: Record<Level, string> = {
  quieter: "text-quiet font-medium",
  usual: "text-ink/60",
  busier: "text-busy font-medium",
  "much busier": "text-busy font-bold",
};
const DAYPART_ORDER = ["morning", "lunch", "afternoon", "evening", "late"] as const;
const PART_NAME: Record<string, string> = {
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  evening: "Evening",
  late: "Late",
};

export default function EveningCard({
  placeId,
  placeName,
  forecast: f,
  copy,
  warnings,
  newsChecked,
  units,
  locked,
}: {
  placeId: string;
  placeName: string;
  forecast: Forecast;
  copy: Copy;
  warnings: string[];
  newsChecked: string | null;
  units: { usual_daily: number | null; unit: string | null };
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [weights, setWeights] = useState<WeightInfo>({});
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(!locked);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setCanEdit(!locked || !!editKeyFor(placeId));
    setOrigin(window.location.origin);
  }, [locked, placeId]);

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
      headers: editHeaders(placeId),
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
  const ratio = dayRatio(f);
  const estimate = units.usual_daily && units.unit ? Math.round((units.usual_daily * ratio) / 5) * 5 : null;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Tomorrow at ${placeName}: ${copy.headline}\n1. ${copy.actions[0]}\n2. ${copy.actions[1]}${origin ? `\n${origin}/p/${encodeURIComponent(placeId)}` : ""}`,
  )}`;
  const day = f.weekday[0].toUpperCase() + f.weekday.slice(1);
  const dateLabel = new Date(`${f.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <section className="rounded-xl border border-ink/[0.07] bg-surface px-5 pb-5 pt-4">
      <div className="flex items-baseline justify-between gap-3 text-sm text-ink/55">
        <span>Tomorrow</span>
        <span className="shrink-0 font-mono text-xs tabular">
          {day.slice(0, 3)} {dateLabel}
        </span>
      </div>
      <h1 className="mt-3 text-[1.65rem] font-semibold leading-[1.15] tracking-tight">{copy.headline}</h1>

      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="mt-5 w-full text-ink" role="img" aria-label="Tomorrow's busyness curve">
        <line x1={0} x2={g.width} y1={g.height - 14} y2={g.height - 14} stroke="currentColor" strokeOpacity={0.08} />
        <path d={g.band} fill="rgb(var(--band))" style={{ fillOpacity: "var(--band-alpha)" }} />
        <path d={g.baseline} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="3 3" />
        <path d={g.forecast} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {g.ticks.map((t) => (
          <text key={t.h} x={t.x} y={g.height - 1} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.45} className="font-mono">
            {t.label}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/55">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-ink/40" />
          Your usual {day}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm bg-band/40" />
          Tomorrow, wider where less sure
        </span>
      </div>

      {f.baselineSource === "peers" && <p className="mt-2 text-xs text-ink/55">Based on places like yours.</p>}
      {estimate !== null && (
        <p className="mt-3 text-sm text-ink/70">
          About <span className="font-mono font-semibold text-ink tabular">{estimate}</span> {units.unit} tomorrow
          <span className="text-ink/50">
            {" "}
            (usual {units.usual_daily}, {ratio >= 1 ? "+" : "−"}
            {Math.abs(Math.round((ratio - 1) * 100))}%)
          </span>
        </p>
      )}

      <dl className="mt-5 grid grid-cols-5 border-y border-ink/[0.07] py-3 text-center">
        {DAYPART_ORDER.map((part) => {
          const lvl = f.buckets[part];
          return (
            <div key={part}>
              <dt className="text-[11px] text-ink/50">{PART_NAME[part]}</dt>
              <dd className={`mt-0.5 text-sm leading-tight ${lvl ? LEVEL_COLOR[lvl] : "text-ink/25"}`}>{lvl ?? "closed"}</dd>
            </div>
          );
        })}
      </dl>

      <ul className="mt-2">
        {f.pins.map((p, i) => (
          <li key={i} className="border-b border-ink/[0.07] last:border-b-0">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className="flex w-full items-center gap-3 py-2.5 text-left text-[15px]"
            >
              <span aria-hidden className={`shrink-0 self-center ${p.effect > 0 ? "text-busy" : p.effect < 0 ? "text-quiet" : "text-ink/40"}`}>
                {p.effect > 0 ? <ArrowUp size={14} weight="bold" /> : p.effect < 0 ? <ArrowDown size={14} weight="bold" /> : <Minus size={14} weight="bold" />}
              </span>
              <span className="flex-1">{p.label}</span>
              {p.distanceKm !== null && (
                <span className="shrink-0 font-mono text-xs text-ink/50 tabular">{fmtDistance(p.distanceKm)}</span>
              )}
              <CaretDown
                size={14}
                weight="bold"
                aria-hidden
                className={`shrink-0 self-center text-ink/35 transition-transform ${open === i ? "rotate-180" : ""}`}
              />
            </button>
            {open === i && (
              <div className="mb-3 ml-[26px] space-y-1 text-[13px] leading-snug text-ink/70">
                {p.links?.length ? (
                  <ul className="space-y-1.5">
                    {p.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="group block">
                          <span className="text-ink underline decoration-ink/20 underline-offset-2 group-hover:decoration-ink/60">{l.title}</span>
                          {l.source && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-ink/45">
                              {l.source}
                              <ArrowUpRight size={11} weight="bold" aria-hidden />
                            </span>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  p.detail && <p>{p.detail}</p>
                )}
                <p className="text-ink/50">
                  {p.source}. {fmtHour(p.startHour)} to {fmtHour(p.endHour)}
                  {p.distanceKm !== null && `, ${p.distanceKm.toFixed(1)} km away`}.
                </p>
                {canEdit && (
                  <WeightPicker
                    phrase={KIND_PHRASE[p.kind]}
                    info={weights[p.kind]}
                    disabled={saving}
                    onPick={(level) => setLevel(p.kind, level)}
                  />
                )}
              </div>
            )}
          </li>
        ))}
        {!f.pins.length && <li className="py-2.5 text-[15px] text-ink/55">Nothing nearby is likely to move your crowd.</li>}
      </ul>

      <NewsCheck placeId={placeId} checked={newsChecked} />

      <ol className="mt-4 space-y-2.5 rounded-lg bg-paper px-4 py-3.5">
        {copy.actions.map((a, i) => (
          <li key={i} className="flex gap-3 text-base font-medium leading-snug">
            <span className="font-mono text-sm leading-6 text-ink/40">{i + 1}</span>
            <span>{a}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
        <a
          href={`/api/share?place_id=${encodeURIComponent(placeId)}&date=${f.date}`}
          target="_blank"
          className="rounded-lg bg-paper px-4 py-2.5 text-center text-sm font-medium transition-transform active:scale-[0.98]"
        >
          Image
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-ink px-4 py-2.5 text-center text-sm font-medium text-paper transition-transform active:scale-[0.98]"
        >
          Send to staff on WhatsApp
        </a>
      </div>
      <PushButton placeId={placeId} />
      <p className="mt-3 text-xs text-ink/50">
        {f.tuned ? (
          "Tuned to your place"
        ) : (
          <>
            Learning your place <span className="whitespace-nowrap font-mono tabular">{f.taps}/7</span>
          </>
        )}
      </p>

      {warnings.length > 0 && (
        <p className="mt-3 text-xs text-ink/45">Some sources were unavailable: {warnings.map((w) => w.split(":")[0]).join(", ")}.</p>
      )}
    </section>
  );
}

function fmtDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
}

/** Refetch news for tomorrow's card on demand; the nightly build only looks once, at 6 pm. */
function NewsCheck({ placeId, checked }: { placeId: string; checked: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const [err, setErr] = useState("");

  async function check() {
    setState("checking");
    setErr("");
    const r = await fetch("/api/news", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ place_id: placeId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setState("error");
      setErr(j.error ?? "Could not check the news.");
      return;
    }
    setState("idle");
    router.refresh(); // the card was rebuilt with fresh headlines
  }

  return (
    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-ink/50">
      <span role="status">
        {state === "checking"
          ? "Checking the news…"
          : state === "error"
            ? err
            : checked
              ? `News checked ${checked}`
              : "News not checked yet"}
      </span>
      <button
        onClick={check}
        disabled={state === "checking"}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-ink underline decoration-ink/25 underline-offset-2 transition-opacity disabled:opacity-40"
      >
        Check news again
      </button>
    </div>
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
    <div className="pt-2">
      <div className="font-medium text-ink">How much does {phrase} move your place?</div>
      <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-paper p-1">
        {OWNER_LEVELS.map((l) => (
          <button
            key={l.id}
            disabled={disabled}
            onClick={() => onPick(l.id)}
            className={`rounded-md px-1 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${current === l.id ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--ink)/0.12)]" : "text-ink/55"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-ink/50">
        {info?.ownerSet
          ? "You set this. It widens the range a little."
          : info
            ? `Tuned by your taps (${info.w.toFixed(1)}×).`
            : "Default. Your morning taps adjust it over time."}
      </div>
    </div>
  );
}
