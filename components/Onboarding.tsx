"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import { PLACES_EVENT, forgetPlace, rememberPlace, savedPlaces, type SavedPlace } from "@/lib/saved";
import TopBar from "./TopBar";
import PlaceSummary from "./PlaceSummary";
import { editHeaders, saveEditKey } from "@/lib/editkey-client";
import { LANGUAGES, UNITS } from "@/lib/languages";

interface Hit {
  place_id: string;
  title: string;
  address: string;
}
interface Preview {
  place_id: string;
  title: string;
  address: string;
  city: string;
  area?: string | null;
  state?: string | null;
  country: string | null;
  archetype: string;
  drinking?: "dry" | "low" | "medium" | "high" | null;
  baselineSource: "own" | "peers";
  weekday: string;
  curve: (number | null)[] | null;
  leagueOptions: string[];
}

const ARCHETYPES = [
  ["cafe", "Café"],
  ["restaurant", "Sit-down restaurant"],
  ["bar", "Bar"],
  ["quick_service", "Quick service"],
  ["cloud_kitchen", "Cloud kitchen"],
  ["retail", "Retail"],
  ["salon", "Salon"],
] as const;

export default function Onboarding() {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pv, setPv] = useState<Preview | null>(null);
  const [archetype, setArchetype] = useState("cafe");
  const [areaType, setAreaType] = useState("residential");
  const [radius, setRadius] = useState(2);
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [leagues, setLeagues] = useState<string[]>([]);
  const [usualDaily, setUsualDaily] = useState("");
  const [unit, setUnit] = useState("orders");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  useEffect(() => {
    const sync = () => setSaved(savedPlaces());
    sync();
    window.addEventListener(PLACES_EVENT, sync);
    return () => window.removeEventListener(PLACES_EVENT, sync);
  }, []);

  async function search() {
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/place/search?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setHits(j.hits);
  }

  async function pick(h: Hit) {
    setBusy(true);
    setPicking(true);
    setErr("");
    const r = await fetch(`/api/place/preview?place_id=${encodeURIComponent(h.place_id)}`);
    const j = await r.json();
    setBusy(false);
    setPicking(false);
    if (!r.ok) return setErr(j.error);
    setPv(j);
    setArchetype(j.archetype);
    setCity(j.city);
    setArea(j.area ?? "");
    setLeagues(j.country?.toLowerCase() === "india" ? j.leagueOptions : []);
  }

  async function save() {
    if (!pv) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/place", {
      method: "POST",
      headers: editHeaders(pv.place_id),
      body: JSON.stringify({
        place_id: pv.place_id,
        archetype,
        area_type: areaType,
        radius_km: radius,
        leagues,
        city,
        area,
        state: pv.state,
        country: pv.country,
        usual_daily: usualDaily ? Number(usualDaily) : null,
        unit,
        language,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setBusy(false);
      return setErr(j.error);
    }
    if (j.editKey) saveEditKey(pv.place_id, j.editKey);
    rememberPlace({ id: pv.place_id, name: pv.title.split("|")[0].trim(), where: [area, city].filter(Boolean).join(", ") });
    window.location.href = `/p/${encodeURIComponent(pv.place_id)}`;
  }

  return (
    <main>
      <TopBar />
      {pv && (
        <button
          onClick={() => setPv(null)}
          className="-ml-2 mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink/55 active:bg-ink/[0.05]"
        >
          <ArrowLeft size={14} weight="bold" />
          Search again
        </button>
      )}
      {pv ? (
        <h1 className="text-2xl font-semibold tracking-tight">Set up {pv.title.split("|")[0].trim()}</h1>
      ) : (
        <section className="pt-6">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter">How busy will your place be tomorrow?</h1>
          <p className="mt-4 max-w-[34ch] text-base leading-relaxed text-ink/70">
            Pick your business on Google Maps. We forecast tomorrow from your own busy hours, plus matches, events and weather.
          </p>
        </section>
      )}

      {!pv && (
        <>
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <label htmlFor="biz" className="block text-sm font-medium">
              Your business
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="biz"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Blue Tokai, Indiranagar"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-ink/20 bg-surface px-4 py-3 text-base placeholder:text-ink/45 focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
              />
              <button
                disabled={busy || !q.trim()}
                className="whitespace-nowrap rounded-lg bg-ink px-5 font-medium text-paper transition-transform active:scale-[0.98] disabled:opacity-30"
              >
                Search
              </button>
            </div>
          </form>

          {busy && !picking && hits.length === 0 && (
            <ul className="mt-4 space-y-2" aria-hidden>
              {[0, 1].map((i) => (
                <li key={i} className="h-[68px] animate-pulse rounded-lg bg-ink/[0.05]" />
              ))}
            </ul>
          )}

          {picking ? (
            <div className="mt-6" role="status">
              <div className="h-44 animate-pulse rounded-xl bg-ink/[0.05]" />
              <p className="mt-3 text-sm text-ink/70">Reading this place's busy hours. This takes up to 20 seconds.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-ink/[0.07] overflow-hidden rounded-xl border border-ink/[0.07] bg-surface empty:hidden">
              {hits.map((h) => (
                <li key={h.place_id}>
                  <button
                    onClick={() => pick(h)}
                    className="w-full px-4 py-3 text-left transition-colors active:bg-paper"
                  >
                    <div className="font-medium">{h.title}</div>
                    <div className="mt-0.5 text-xs text-ink/55">{h.address}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {saved.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-medium text-ink/55">Your places</h2>
              <ul className="mt-2 space-y-2">
                {saved.map((p) => (
                  <li key={p.id} className="flex items-stretch rounded-xl border border-ink/[0.07] bg-surface">
                    <Link
                      href={`/p/${encodeURIComponent(p.id)}`}
                      aria-label={`See tomorrow for ${p.name}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 transition-colors active:bg-paper"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.name}</span>
                        {p.where && <span className="mt-0.5 block truncate text-sm text-ink/55">{p.where}</span>}
                        {saved.length > 1 && <PlaceSummary id={p.id} />}
                      </span>
                      <CaretRight size={16} weight="bold" aria-hidden className="shrink-0 text-ink/30" />
                    </Link>
                    <button
                      onClick={() => setSaved(forgetPlace(p.id))}
                      aria-label={`Remove ${p.name} from this phone`}
                      className="shrink-0 border-l border-ink/[0.07] px-3.5 text-xs text-ink/45 transition-colors active:bg-paper"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {pv && (
        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-ink/[0.07] bg-surface p-5">
            <div className="text-sm text-ink/50">{pv.title}</div>
            <div className="mt-1 font-semibold">
              This is how your {pv.weekday[0].toUpperCase() + pv.weekday.slice(1)} normally goes.
            </div>
            {pv.curve ? (
              (() => {
                const c = pv.curve!;
                const open = c.map((v, h) => (v === null ? -1 : h)).filter((h) => h >= 0);
                const from = Math.min(...open);
                const to = Math.max(...open);
                const n = to - from + 1;
                const w = 240 / n;
                const lab = (h: number) => `${h % 12 || 12}${h < 12 || h === 24 ? "a" : "p"}`;
                return (
                  <svg viewBox="0 0 240 84" className="mt-4 w-full text-ink">
                    {c.slice(from, to + 1).map((v, i) =>
                      v === null ? null : (
                        <rect key={i} x={i * w + 1} y={66 - v * 0.6} width={w - 2} height={Math.max(v * 0.6, 1)} fill="currentColor" rx={1.5} />
                      ),
                    )}
                    {[from, Math.round((from + to) / 2), to].map((h, i) => (
                      <text key={i} x={(h - from) * w + w / 2} y={80} fontSize="8" fill="currentColor" fillOpacity={0.45} className="font-mono" textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>
                        {lab(h)}
                      </text>
                    ))}
                  </svg>
                );
              })()
            ) : (
              <p className="mt-2 text-sm text-ink/60">No popular-times data for this place or its neighbours.</p>
            )}
            {pv.baselineSource === "peers" && <p className="mt-1 text-xs text-ink/50">Based on places like yours.</p>}
          </div>

          <label className="block text-sm font-medium">
            What kind of place is it?
            <select
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
            >
              {ARCHETYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {archetype === "bar" && pv.drinking === "dry" && (
              <span className="mt-2 block text-xs font-normal text-ink/60">
                {pv.state ?? "This state"} is a dry state, so match and payday crowds count for less here. If you don&apos;t serve alcohol, pick
                Restaurant or Café instead.
              </span>
            )}
          </label>

          <label className="block text-sm font-medium">
            Is your area mostly offices or homes?
            <select
              value={areaType}
              onChange={(e) => setAreaType(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
            >
              <option value="residential">Homes</option>
              <option value="office">Offices</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            City
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
          </label>

          <label className="block text-sm font-medium">
            Neighbourhood
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. Connaught Place"
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
            />
            <span className="mt-1 block text-xs font-normal text-ink/50">Used to catch protests and road closures near you.</span>
          </label>

          <label className="block text-sm font-medium">
            How far does your crowd come from? <span className="font-mono font-normal text-ink/60">{radius} km</span>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-3 w-full accent-[rgb(var(--ink))]"
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">How many orders on a usual day?</legend>
            <div className="mt-1.5 flex gap-2">
              <input
                inputMode="numeric"
                value={usualDaily}
                onChange={(e) => setUsualDaily(e.target.value.replace(/\D/g, ""))}
                placeholder="300"
                aria-label="How many"
                className="w-28 rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                aria-label="Counted as"
                className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <span className="mt-1 block text-xs font-normal text-ink/50">Optional. Your total for a normal day, all items together. With it, the card says “about 40 more orders” instead of “30% busier”.</span>
          </fieldset>

          <label className="block text-sm font-medium">
            Write the card in
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-ink/15 bg-surface px-3 py-3 text-base font-normal focus:border-ink/60 focus:outline-none focus:ring-2 focus:ring-ink/10"
            >
              {Object.entries(LANGUAGES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          {pv.leagueOptions.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium">Matches that move your crowd</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {pv.leagueOptions.map((l) => {
                  const on = leagues.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLeagues(on ? leagues.filter((x) => x !== l) : [...leagues, l])}
                      aria-pressed={on}
                      className={`rounded-lg border px-4 py-2 text-sm transition-colors ${on ? "border-ink bg-ink text-paper" : "border-ink/15 bg-surface"}`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-paper from-70% to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-6">
            <button
              onClick={save}
              disabled={busy || !pv.curve}
              className="w-full rounded-lg bg-ink px-5 py-4 text-base font-semibold text-paper transition-transform active:scale-[0.99] disabled:opacity-30"
            >
              {busy ? "Finding what's near you…" : "Show me tomorrow"}
            </button>
          </div>
        </div>
      )}

      {err && <p className="mt-4 text-sm text-busy">{err}</p>}
    </main>
  );
}
