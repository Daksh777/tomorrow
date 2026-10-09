"use client";

import { useEffect } from "react";

/** Registers the service worker (offline card, evening push). Production only: in dev it would cache stale pages. */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
