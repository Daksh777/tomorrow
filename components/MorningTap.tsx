"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editHeaders, editKeyFor } from "@/lib/editkey-client";

const OPTIONS = [
  { label: "Quieter", value: -1 },
  { label: "As expected", value: 0 },
  { label: "Busier", value: 1 },
] as const;

const ANSWERED: Record<number, string> = { [-1]: "quieter", 0: "as expected", 1: "busier" };

export default function MorningTap({ placeId, date, answered, locked }: { placeId: string; date: string; answered: number | null; locked: boolean }) {
  const router = useRouter();
  const [canTap, setCanTap] = useState(!locked);
  useEffect(() => setCanTap(!locked || !!editKeyFor(placeId)), [locked, placeId]);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">(answered === null ? "idle" : "done");
  const [msg, setMsg] = useState(answered === null ? "" : `You said yesterday was ${ANSWERED[answered]}. Thanks.`);

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
        ? "You already answered for that day."
        : changed.length
          ? changed.map(([k, v]) => `${k.replace("_", " ")} weight ${v.from.toFixed(1)} to ${v.to.toFixed(1)}`).join(", ")
          : "Thanks. Noted.",
    );
    if (j.learnedFrom === "live" && j.score) setMsg((m) => `${m} Learned from Google's live readings (${j.score.inside} of ${j.score.n} inside).`);
    setState("done");
    router.refresh(); // the card's tap counter is counted live
  }

  if (!canTap && state !== "done") return null; // read-only: only the owner's phone trains the forecast
  return (
    <section className="rounded-xl border border-ink/[0.07] bg-surface p-5">
      <h2 className="text-base font-semibold">How was yesterday?</h2>
      {state !== "done" && <p className="mt-0.5 text-sm text-ink/55">One tap tunes tomorrow&apos;s forecast to your place.</p>}
      {state === "done" ? (
        <p className="mt-2 text-sm text-ink/70">{msg}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              disabled={state === "saving"}
              onClick={() => tap(o.value)}
              className="rounded-lg bg-paper px-2 py-3 text-sm font-medium transition-transform active:scale-[0.98] active:bg-band/25 disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {state === "error" && <p className="mt-2 text-xs text-busy">{msg}</p>}
    </section>
  );
}
