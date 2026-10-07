"use client";

import { useState } from "react";

const OPTIONS = [
  { label: "Quieter", value: -1 },
  { label: "As expected", value: 0 },
  { label: "Busier", value: 1 },
] as const;

export default function MorningTap({ placeId, date }: { placeId: string; date: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function tap(value: number) {
    setState("saving");
    const r = await fetch("/api/tap", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
          ? changed.map(([k, v]) => `${k.replace("_", " ")} weight ${v.from.toFixed(1)} → ${v.to.toFixed(1)}`).join(" · ")
          : "Thanks. Noted.",
    );
    setState("done");
  }

  return (
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold">How was yesterday?</h2>
      {state === "done" ? (
        <p className="mt-2 text-sm text-ink/70">{msg}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              disabled={state === "saving"}
              onClick={() => tap(o.value)}
              className="rounded-xl bg-paper px-2 py-3 text-sm font-medium active:bg-band/30"
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
