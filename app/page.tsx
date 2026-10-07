"use client";

import { useEffect, useState } from "react";
import Onboarding from "@/components/Onboarding";

/** Single-device PWA: a saved place goes straight to its card; otherwise the search is the home page. */
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

  return first ? <Onboarding /> : null;
}
