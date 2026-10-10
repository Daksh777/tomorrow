"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpRight, CaretDown, Minus } from "@phosphor-icons/react";
import { curveGeometry } from "@/lib/curve";
import { OWNER_LEVELS, dayRatio } from "@/lib/forecast";
import { editHeaders, editKeyFor } from "@/lib/editkey-client";
import PushButton from "./PushButton";
import { KIND_PHRASE } from "@/lib/kinds";
import { PHRASES } from "@/lib/phrases";
import { pinLabel } from "@/lib/pinLabels";
import { dateLocale, ui, type Ui } from "@/lib/ui";
import type { Copy, Forecast, Language, Level, SignalKind } from "@/lib/types";


type WeightInfo = Record<string, { w: number; ownerSet: boolean }>;

const LEVEL_COLOR: Record<Level, string> = {
  quieter: "text-quiet font-medium",
  usual: "text-ink/60",
  busier: "text-busy font-medium",
  "much busier": "text-busy font-bold",
};
const DAYPART_ORDER = ["morning", "lunch", "afternoon", "evening", "late"] as const;

export default function EveningCard({
  placeId,
  placeName,
  forecast: f,
  copy,
  warnings,
  newsChecked,
  units,
  locked,
  lang = "en",
}: {
  placeId: string;
  placeName: string;
  forecast: Forecast;
  copy: Copy;
  warnings: string[];
  newsChecked: string | null;
  units: { usual_daily: number | null; unit: string | null };
  locked: boolean;
  lang?: Language;
}) {
  const router = useRouter();
  const t = ui(lang);
  const ph = PHRASES[lang] ?? PHRASES.en;
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
  const shown = useCountUp(estimate, units.usual_daily);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `${t.waIntro(placeName)} ${copy.headline}\n1. ${copy.actions[0]}\n2. ${copy.actions[1]}${origin ? `\n${origin}/p/${encodeURIComponent(placeId)}` : ""}`,
  )}`;
  const day = ph.day[f.weekday];
  const dateLabel = new Date(`${f.date}T12:00:00`).toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const pct = `${ratio >= 1 ? "+" : "−"}${Math.abs(Math.round((ratio - 1) * 100))}%`;
  const about = estimate !== null ? t.about(ph.unit(units.unit!), units.usual_daily!, pct) : null;

  return (
    <section className="rounded-xl border border-ink/[0.07] bg-surface px-5 pb-5 pt-4">
      <div className="flex items-baseline justify-between gap-3 text-sm text-ink/55">
        <span>{t.tomorrow}</span>
        <span className="shrink-0 font-mono text-xs tabular">{dateLabel}</span>
      </div>
      <h1 className="mt-3 text-[1.65rem] font-semibold leading-[1.15] tracking-tight">{copy.headline}</h1>

      <svg viewBox={`0 0 ${g.width} ${g.height}`} className="mt-5 w-full text-ink" role="img" aria-label="Tomorrow's busyness curve">
        <line x1={0} x2={g.width} y1={g.height - 14} y2={g.height - 14} stroke="currentColor" strokeOpacity={0.08} />
        <path d={g.band} fill="rgb(var(--band))" style={{ fillOpacity: "var(--band-alpha)" }} className="fade-in" />
        <path d={g.baseline} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="3 3" />
        <path d={g.forecast} pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" className="draw" />
        {g.ticks.map((t) => (
          <text key={t.h} x={t.x} y={g.height - 1} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.45} className="font-mono">
            {t.label}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/55">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-ink/40" />
          {t.yourUsual(day)}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-sm bg-band/40" />
          {t.bandLegend}
        </span>
      </div>

      {f.baselineSource === "peers" && <p className="mt-2 text-xs text-ink/55">{t.peers}</p>}
      {f.correction && Object.keys(f.correction).length > 0 && (
        <p className="mt-2 text-xs text-ink/55">
          {t.correction(
            (Object.entries(f.correction) as [keyof Ui["part"], { factor: number }][])
              .map(([p, c]) => `${t.part[p].toLowerCase()} ${c.factor >= 1 ? "+" : "−"}${Math.abs(Math.round((c.factor - 1) * 100))}%`)
              .join(", "),
          )}
        </p>
      )}
      {about && (
        <p className="mt-3 text-sm text-ink/70">
          {about[0]}
          <span className="font-mono font-semibold text-ink tabular">{shown}</span>
          {about[1]} <span className="text-ink/50">{about[2]}</span>
        </p>
      )}

      <dl className="mt-5 grid grid-cols-5 border-y border-ink/[0.07] py-3 text-center">
        {DAYPART_ORDER.map((part) => {
          const lvl = f.buckets[part];
          return (
            <div key={part}>
              <dt className="text-[11px] text-ink/50">{t.part[part]}</dt>
              <dd className={`mt-0.5 text-sm leading-tight ${lvl ? LEVEL_COLOR[lvl] : "text-ink/25"}`}>{lvl ? t.level[lvl] : t.closed}</dd>
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
              className="flex w-full items-center gap-3 rounded-md py-2.5 text-left text-[15px] active:bg-ink/[0.03]"
            >
              <span aria-hidden className={`shrink-0 self-center ${p.effect > 0 ? "text-busy" : p.effect < 0 ? "text-quiet" : "text-ink/40"}`}>
                {p.effect > 0 ? <ArrowUp size={14} weight="bold" /> : p.effect < 0 ? <ArrowDown size={14} weight="bold" /> : <Minus size={14} weight="bold" />}
              </span>
              <span className="flex-1">{pinLabel(p.label, lang)}</span>
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
              <div className="reveal mb-3 ml-[26px] space-y-1 text-[13px] leading-snug text-ink/70">
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
                  {p.source}. {lang === "en" ? ph.window(p.startHour, p.endHour) : ph.window(Math.round(p.startHour), Math.round(p.endHour))}
                  {p.distanceKm !== null && `, ${t.kmAway(p.distanceKm.toFixed(1))}`}.
                </p>
                {canEdit && (
                  <WeightPicker
                    t={t}
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
        {!f.pins.length && <li className="py-2.5 text-[15px] text-ink/55">{t.noPins}</li>}
      </ul>

      <NewsCheck placeId={placeId} checked={newsChecked} t={t} />

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
          {t.image}
        </a>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-ink px-4 py-2.5 text-center text-sm font-medium text-paper transition-transform active:scale-[0.98]"
        >
          {t.whatsapp}
        </a>
      </div>
      <PushButton placeId={placeId} lang={lang} />
      <p className="mt-3 text-xs text-ink/50">
        {f.tuned ? (
          t.tuned
        ) : (
          <>
            {t.learning} <span className="whitespace-nowrap font-mono tabular">{f.taps}/7</span>
          </>
        )}
      </p>

      {warnings.length > 0 && (
        <p className="mt-3 text-xs text-ink/45">{t.sourcesDown(warnings.map((w) => w.split(":")[0]).join(", "))}</p>
      )}
    </section>
  );
}

/** The day's count runs from the usual number to tomorrow's, so the change is seen, not just read. */
function useCountUp(target: number | null, from: number | null): number | null {
  const [n, setN] = useState(target);
  useEffect(() => {
    if (target === null || from === null || target === from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(target);
    const t0 = performance.now() + 300;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 800));
      setN(Math.round((from + (target - from) * (1 - Math.pow(1 - k, 3))) / 5) * 5);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setN(from);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, from]);
  return n;
}

function fmtDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
}

/** Refetch news for tomorrow's card on demand; the nightly build only looks once, at 6 pm. */
function NewsCheck({ placeId, checked, t }: { placeId: string; checked: string | null; t: Ui }) {
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
          ? t.checkingNews
          : state === "error"
            ? err
            : checked
              ? t.newsChecked(checked)
              : t.newsNotChecked}
      </span>
      <button
        onClick={check}
        disabled={state === "checking"}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-ink underline decoration-ink/25 underline-offset-2 transition-opacity disabled:opacity-40"
      >
        {t.checkNews}
      </button>
    </div>
  );
}

/** "How much does X move you?" in words. Applies to every future signal of that kind. */
function WeightPicker({
  t,
  phrase,
  info,
  disabled,
  onPick,
}: {
  t: Ui;
  phrase: string;
  info: { w: number; ownerSet: boolean } | undefined;
  disabled: boolean;
  onPick: (level: string) => void;
}) {
  const current = info?.ownerSet ? OWNER_LEVELS.reduce((a, b) => (Math.abs(b.w - info.w) < Math.abs(a.w - info.w) ? b : a)).id : "default";
  return (
    <div className="pt-2">
      <div className="font-medium text-ink">{t.howMuch(phrase)}</div>
      <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-paper p-1">
        {OWNER_LEVELS.map((l) => (
          <button
            key={l.id}
            disabled={disabled}
            onClick={() => onPick(l.id)}
            className={`rounded-md px-1 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${current === l.id ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--ink)/0.12)]" : "text-ink/55"}`}
          >
            {t.ownerLevel[l.id]}
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-xs text-ink/50">
        {info?.ownerSet
          ? t.youSet
          : info
            ? t.tunedByTaps(info.w.toFixed(1))
            : t.defaultNote}
      </div>
    </div>
  );
}
