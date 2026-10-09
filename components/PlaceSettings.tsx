"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretDown } from "@phosphor-icons/react";
import { editHeaders, editKeyFor } from "@/lib/editkey-client";
import { LANGUAGES, UNITS } from "@/lib/languages";
import type { Language } from "@/lib/types";

const box =
  "rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10";
const field = `mt-1.5 w-full ${box}`;

/** Language of the headline and actions, and the owner's usual-day numbers. Owner's phone only. */
export default function PlaceSettings({
  placeId,
  locked,
  language,
  usualDaily,
  unit,
}: {
  placeId: string;
  locked: boolean;
  language: Language;
  usualDaily: number | null;
  unit: string | null;
}) {
  const router = useRouter();
  const [canEdit, setCanEdit] = useState(!locked);
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Language>(language);
  const [n, setN] = useState(usualDaily ? String(usualDaily) : "");
  const [u, setU] = useState(unit ?? "orders");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [err, setErr] = useState("");
  useEffect(() => setCanEdit(!locked || !!editKeyFor(placeId)), [locked, placeId]);

  if (!canEdit) {
    return <p className="mt-4 text-center text-xs text-ink/45">Read-only: this place was set up on another phone.</p>;
  }

  async function save() {
    setState("saving");
    setErr("");
    const r = await fetch("/api/place/settings", {
      method: "PATCH",
      headers: editHeaders(placeId),
      body: JSON.stringify({ place_id: placeId, language: lang, usual_daily: n ? Number(n) : null, unit: u }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setState("error");
      setErr(j.error ?? "Could not save");
      return;
    }
    setState("idle");
    setOpen(false);
    router.refresh(); // tomorrow's card rebuilds in the new language and units
  }

  return (
    <section className="mt-3 rounded-xl border border-ink/[0.07] bg-surface">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="text-base font-semibold">Language and your numbers</span>
        <CaretDown size={14} weight="bold" className={`text-ink/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 px-5 pb-5">
          <label className="block text-sm font-medium">
            Write the card in
            <select value={lang} onChange={(e) => setLang(e.target.value as Language)} className={field}>
              {(Object.entries(LANGUAGES) as [Language, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="text-sm font-medium">How many orders on a usual day?</legend>
            <div className="mt-1.5 flex gap-2">
              <input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} placeholder="300" aria-label="How many" className={`${box} w-28 flex-none`} />
              <select value={u} onChange={(e) => setU(e.target.value)} aria-label="Counted as" className={`${box} min-w-0 flex-1`}>
                {UNITS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <span className="mt-1 block text-xs text-ink/50">Optional. Your total for a normal day, all items together. With it, the card says “about 40 more orders” instead of “30% busier”.</span>
          </fieldset>
          <button
            onClick={save}
            disabled={state === "saving"}
            className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-paper transition-transform active:scale-[0.99] disabled:opacity-40"
          >
            {state === "saving" ? "Saving…" : "Save and rebuild tomorrow"}
          </button>
          {state === "error" && <p className="text-xs text-busy">{err}</p>}
        </div>
      )}
    </section>
  );
}
