"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "@phosphor-icons/react";
import { editHeaders, editKeyFor } from "@/lib/editkey-client";
import { fmtHour } from "@/lib/time";
import type { OwnerEvent } from "@/lib/types";

const LEVELS: [OwnerEvent["level"], string][] = [
  ["quieter", "Quieter"],
  ["busier", "Busier"],
  ["much_busier", "Much busier"],
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const field =
  "w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10";

/**
 * The owner's own plans (a quiz night, a discount day, a private booking): things we can't see that they
 * know. Each becomes a pin on its date; taps tune how far to trust them.
 */
export default function OwnerPlans({ placeId, locked, events, tomorrow }: { placeId: string; locked: boolean; events: OwnerEvent[]; tomorrow: string }) {
  const router = useRouter();
  const [canEdit, setCanEdit] = useState(!locked);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(tomorrow);
  const [start, setStart] = useState(19);
  const [end, setEnd] = useState(22);
  const [level, setLevel] = useState<OwnerEvent["level"]>("busier");
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setCanEdit(!locked || !!editKeyFor(placeId)), [locked, placeId]);

  if (!canEdit && !events.length) return null;

  async function add() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/owner-events", {
      method: "POST",
      headers: editHeaders(placeId),
      body: JSON.stringify({ place_id: placeId, label, date, start_hour: start, end_hour: end, level, weekly }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Could not save");
    setAdding(false);
    setLabel("");
    router.refresh();
  }

  async function remove(id: number) {
    setBusy(true);
    await fetch("/api/owner-events", { method: "DELETE", headers: editHeaders(placeId), body: JSON.stringify({ place_id: placeId, id }) });
    setBusy(false);
    router.refresh();
  }

  const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <section className="mt-3 rounded-xl border border-ink/[0.07] bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Your plans</h2>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-paper px-3 py-1.5 text-sm font-medium transition-transform active:scale-[0.98]">
            <Plus size={14} weight="bold" />
            Add
          </button>
        )}
      </div>
      {!events.length && !adding && <p className="mt-0.5 text-sm text-ink/55">A quiz night, an offer, a big booking: things only you know about. They go on the card.</p>}

      {events.length > 0 && (
        <ul className="mt-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-ink/[0.07] py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{e.label}</span>
                <span className="block text-xs text-ink/55">
                  {e.weekly ? `Every ${new Date(`${e.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" })}` : fmtDate(e.date)}, {fmtHour(e.start_hour)} to {fmtHour(e.end_hour)} ·{" "}
                  {LEVELS.find((l) => l[0] === e.level)?.[1].toLowerCase()}
                </span>
              </span>
              {canEdit && (
                <button onClick={() => remove(e.id)} disabled={busy} aria-label={`Remove ${e.label}`} className="shrink-0 rounded-md p-1.5 text-ink/40 active:bg-paper disabled:opacity-40">
                  <X size={14} weight="bold" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-medium">
            What is it?
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Quiz night" maxLength={60} className={`mt-1.5 ${field}`} />
          </label>
          <label className="block text-sm font-medium">
            Date
            <input type="date" value={date} min={tomorrow} onChange={(e) => setDate(e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm font-medium">
              From
              <select value={start} onChange={(e) => setStart(Number(e.target.value))} className={`mt-1.5 ${field}`}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              To
              <select value={end} onChange={(e) => setEnd(Number(e.target.value))} className={`mt-1.5 ${field}`}>
                {HOURS.map((h) => h + 1).map((h) => (
                  <option key={h} value={h}>
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">It will make you</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-paper p-1">
              {LEVELS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLevel(v)}
                  aria-pressed={level === v}
                  className={`rounded-md px-1 py-2 text-sm font-medium ${level === v ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--ink)/0.12)]" : "text-ink/55"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--ink))]" />
            Every week
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAdding(false)} className="rounded-lg bg-paper px-4 py-2.5 text-sm font-medium">
              Cancel
            </button>
            <button onClick={add} disabled={busy || !label.trim()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper disabled:opacity-40">
              {busy ? "Saving…" : "Add to the card"}
            </button>
          </div>
          {err && <p className="text-xs text-busy">{err}</p>}
        </div>
      )}
    </section>
  );
}
