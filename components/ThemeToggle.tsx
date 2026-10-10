"use client";

import { useEffect, useState } from "react";
import { CircleHalf, Moon, Sun } from "@phosphor-icons/react";

type Theme = "system" | "light" | "dark";
const KEY = "tomorrow.theme";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Theme: follows your phone", light: "Theme: light", dark: "Theme: dark" };

/** Auto (follow the phone) → light → dark. Remembered on this phone; applied before paint by the layout. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* private mode */
    }
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    root.classList.add("theming");
    setTimeout(() => root.classList.remove("theming"), 350);
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* private mode: applies for this visit only */
    }
  }

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : CircleHalf;
  return (
    <button onClick={cycle} aria-label={LABEL[theme]} title={LABEL[theme]} className="shrink-0 rounded-lg p-2 text-ink/60 transition-colors active:bg-ink/[0.05]">
      <Icon size={18} weight="bold" />
    </button>
  );
}
