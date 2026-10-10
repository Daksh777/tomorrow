"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editHeaders, editKeyFor } from "@/lib/editkey-client";
import { ui } from "@/lib/ui";
import type { Language } from "@/lib/types";

const OPTIONS = [
  { key: "tapQuieter", value: -1 },
  { key: "tapExpected", value: 0 },
  { key: "tapBusier", value: 1 },
] as const;

export default function MorningTap({ placeId, date, answered, locked, lang = "en" }: { placeId: string; date: string; answered: number | null; locked: boolean; lang?: Language }) {
  const router = useRouter();
  const t = ui(lang);
  const said = (v: number) => t.youSaid(t[OPTIONS.find((o) => o.value === v)!.key]);
  const [canTap, setCanTap] = useState(!locked);
  useEffect(() => setCanTap(!locked || !!editKeyFor(placeId)), [locked, placeId]);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">(answered === null ? "idle" : "done");
  const [msg, setMsg] = useState(answered === null ? "" : said(answered));

  async function tap(value: number) {
    setState("saving");
    const r = await fetch("/api/tap", {
      method: "POST",
      headers: editHeaders(placeId),
      body: JSON.stringify({ place_id: placeId, date, value }),
    });
    const j = await r.json();
    if (!r.ok) {
      setState("error");
      setMsg(j.error ?? "Could not save");
      return;
    }
    const changed = Object.entries(j.changed ?? {}) as [string, { from: number; to: number }][];
    setMsg(
      j.alreadyTapped
        ? t.alreadyTapped
        : changed.length
          ? changed.map(([k, v]) => t.changed(k.replace("_", " "), v.from.toFixed(1), v.to.toFixed(1))).join(", ")
          : t.thanks,
    );
    if (j.learnedFrom === "live" && j.score) setMsg((m) => `${m} ${t.learnedLive(j.score.inside, j.score.n)}`);
    setState("done");
    router.refresh(); // the card's tap counter is counted live
  }

  if (!canTap && state !== "done") return null; // read-only: only the owner's phone trains the forecast
  return (
    <section className="rounded-xl border border-ink/[0.07] bg-surface p-5">
      <h2 className="text-base font-semibold">{t.howWasYesterday}</h2>
      {state !== "done" && <p className="mt-0.5 text-sm text-ink/55">{t.oneTap}</p>}
      {state === "done" ? (
        <p className="rise mt-2 text-sm text-ink/70">{msg}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              disabled={state === "saving"}
              onClick={() => tap(o.value)}
              className="rounded-lg bg-paper px-2 py-3 text-sm font-medium transition-transform hover:bg-band/15 active:scale-[0.96] active:bg-band/30 disabled:opacity-50"
            >
              {t[o.key]}
            </button>
          ))}
        </div>
      )}
      {state === "error" && <p className="mt-2 text-xs text-busy">{msg}</p>}
    </section>
  );
}
