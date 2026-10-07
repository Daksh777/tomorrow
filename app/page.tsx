"use client";

import { useEffect } from "react";

/** Single-device PWA: remember the owner's place locally and go straight to the card. */
export default function Home() {
  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem("tomorrow.place_id");
    } catch {
      /* private mode */
    }
    window.location.replace(id ? `/p/${encodeURIComponent(id)}` : "/onboarding");
  }, []);
  return <p className="mt-20 text-center text-sm text-ink/50">Tomorrow…</p>;
}
