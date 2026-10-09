"use client";

import { useEffect, useState } from "react";
import type { DayPart, Level } from "@/lib/types";

const ORDER: DayPart[] = ["morning", "lunch", "afternoon", "evening", "late"];
const DOT: Record<Level, string> = { quieter: "bg-quiet", usual: "bg-ink/20", busier: "bg-busy/70", "much busier": "bg-busy" };

/**
 * One line of tomorrow per outlet on the home page, for owners with several places: the headline and a
 * dot per day part. Reads the stored card (built on first view or by the 6 pm cron).
 */
export default function PlaceSummary({ id }: { id: string }) {
  const [card, setCard] = useState<{ headline: string; buckets: Partial<Record<DayPart, Level>> } | null>(null);
  useEffect(() => {
    fetch(`/api/forecast?place_id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setCard({ headline: j.copy.headline, buckets: j.forecast.buckets }))
      .catch(() => {});
  }, [id]);
  if (!card) return <span aria-hidden className="mt-2 block h-4 w-3/4 animate-pulse rounded bg-ink/[0.05]" />;
  return (
    <span className="mt-1.5 block text-sm leading-snug text-ink/75">
      <span className="mr-2 inline-flex gap-0.5 align-middle" aria-hidden>
        {ORDER.map((p) => (
          <span key={p} className={`h-2 w-2 rounded-full ${card.buckets[p] ? DOT[card.buckets[p]!] : "bg-ink/[0.06]"}`} />
        ))}
      </span>
      {card.headline}
    </span>
  );
}
