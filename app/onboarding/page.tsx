"use client";

import { useState } from "react";

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
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pv, setPv] = useState<Preview | null>(null);
  const [archetype, setArchetype] = useState("cafe");
  const [areaType, setAreaType] = useState("residential");
  const [radius, setRadius] = useState(2);
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [leagues, setLeagues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    setErr("");
    const r = await fetch(`/api/place/preview?place_id=${encodeURIComponent(h.place_id)}`);
    const j = await r.json();
    setBusy(false);
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
      headers: { "content-type": "application/json" },
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
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setBusy(false);
      return setErr(j.error);
    }
    try {
      localStorage.setItem("tomorrow.place_id", pv.place_id);
    } catch {
      /* private mode */
    }
    window.location.href = `/p/${encodeURIComponent(pv.place_id)}`;
  }

  return (
    <main>
      <h1 className="text-3xl font-bold">Tomorrow</h1>
      <p className="mt-1 text-sm text-ink/60">Find your business on Google Maps. No POS needed.</p>

      {!pv && (
        <>
          <form
            className="mt-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Your café, with the area"
              className="flex-1 rounded-xl border border-ink/15 bg-white px-4 py-3 text-base"
            />
            <button disabled={busy || !q.trim()} className="rounded-xl bg-ink px-5 text-paper disabled:opacity-40">
              Search
            </button>
          </form>
          <ul className="mt-4 space-y-2">
            {hits.map((h) => (
              <li key={h.place_id}>
                <button onClick={() => pick(h)} className="w-full rounded-xl bg-white px-4 py-3 text-left shadow-sm">
                  <div className="font-medium">{h.title}</div>
                  <div className="text-xs text-ink/50">{h.address}</div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {pv && (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
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
                  <svg viewBox="0 0 240 84" className="mt-3 w-full">
                    {c.slice(from, to + 1).map((v, i) =>
                      v === null ? null : (
                        <rect key={i} x={i * w + 1} y={66 - v * 0.6} width={w - 2} height={Math.max(v * 0.6, 1)} fill="#14181f" rx={2} />
                      ),
                    )}
                    {[from, Math.round((from + to) / 2), to].map((h, i) => (
                      <text key={i} x={(h - from) * w + w / 2} y={80} fontSize="8" fill="#6b7280" textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>
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
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-3"
            >
              {ARCHETYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Is your area mostly offices or homes?
            <select
              value={areaType}
              onChange={(e) => setAreaType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-3"
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
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-3"
            />
          </label>

          <label className="block text-sm font-medium">
            Neighbourhood
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. Connaught Place"
              className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-3"
            />
            <span className="mt-1 block text-xs font-normal text-ink/50">Used to catch protests and road closures near you.</span>
          </label>

          <label className="block text-sm font-medium">
            How far does your crowd come from? {radius} km
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-2 w-full"
            />
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
                      className={`rounded-full px-4 py-2 text-sm ${on ? "bg-ink text-paper" : "bg-white"}`}
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
              className="w-full rounded-xl bg-ink px-5 py-4 text-base font-semibold text-paper disabled:opacity-40"
            >
              {busy ? "Finding what's near you…" : "Show me tomorrow"}
            </button>
          </div>
        </div>
      )}

      {busy && !pv && <p className="mt-4 text-sm text-ink/50">Searching…</p>}
      {err && <p className="mt-4 text-sm text-busy">{err}</p>}
    </main>
  );
}
