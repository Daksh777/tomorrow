"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, Check, Plus } from "@phosphor-icons/react";
import { PLACES_EVENT, rememberPlace, savedPlaces, type SavedPlace } from "@/lib/saved";

const href = (id: string) => `/p/${encodeURIComponent(id)}`;

/**
 * Every page: the tomorrow logotype on the left (home), and on the right a dropdown of the places saved
 * on this phone. On a place page, pass `current`: it is remembered and shown as the selection.
 */
export default function TopBar({ current }: { current?: SavedPlace }) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current) rememberPlace(current);
    const sync = () => setPlaces(savedPlaces());
    sync();
    window.addEventListener(PLACES_EVENT, sync);
    return () => window.removeEventListener(PLACES_EVENT, sync);
  }, [current?.id, current?.name, current?.where]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <header ref={ref} className="relative mb-4 flex h-10 items-center justify-between gap-3">
      <a href="/" className="shrink-0 text-[18px] font-bold tracking-[-0.04em]">
        tomorrow
      </a>

      {places.length > 0 && (
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="-mr-2 flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-ink/70 transition-colors active:bg-ink/[0.05]"
        >
          <span className="truncate">{current?.name ?? "Your places"}</span>
          <CaretDown size={14} weight="bold" className={`shrink-0 text-ink/40 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-64 max-w-full overflow-hidden rounded-xl border border-ink/10 bg-surface py-1 shadow-[0_8px_24px_rgb(var(--ink)/0.08)]"
        >
          {places.map((p) => {
            const on = p.id === current?.id;
            return (
              <a key={p.id} role="menuitem" href={href(p.id)} aria-current={on ? "page" : undefined} className="flex items-center gap-3 px-4 py-2.5 active:bg-paper">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{p.name}</span>
                  {p.where && <span className="block truncate text-xs text-ink/50">{p.where}</span>}
                </span>
                {on && <Check size={16} weight="bold" className="shrink-0 text-ink" />}
              </a>
            );
          })}
          <a role="menuitem" href="/#biz" className="flex items-center gap-2 border-t border-ink/[0.07] px-4 py-3 text-[15px] font-medium active:bg-paper">
            <Plus size={16} weight="bold" />
            Add a place
          </a>
        </div>
      )}
    </header>
  );
}
