"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Single-device PWA: remember the owner's place locally and go straight to the card. */
export default function Home() {
  const [first, setFirst] = useState(false);
  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem("tomorrow.place_id");
    } catch {
      /* private mode */
    }
    if (id) window.location.replace(`/p/${encodeURIComponent(id)}`);
    else setFirst(true);
  }, []);

  if (!first) return <p className="mt-20 text-center text-sm text-ink/50">Tomorrow…</p>;
  return (
    <div className="mt-12">
      <h1 className="text-4xl font-bold">Tomorrow</h1>
      <p className="mt-3 text-lg">How busy will your place be tomorrow, and why.</p>
      <p className="mt-3 text-sm text-ink/60">
        A nightly forecast for your café, restaurant or shop, written like a weather report. Built from your own Google Maps
        popular-times curve, then nudged by matches, events, weather, festivals and disruptions near you. No POS needed.
      </p>
      <Link href="/onboarding" className="mt-8 block w-full rounded-xl bg-ink px-5 py-4 text-center text-base font-semibold text-paper">
        Find your business
      </Link>
    </div>
  );
}
