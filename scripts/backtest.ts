/**
 * Score stored forecasts against Google's live readings and the owners' taps.
 *   npm run backtest                 every place, last 60 days
 *   npm run backtest -- <place_id>   one place
 * Prints, per place: readings scored, share inside the band (aim 80%), mean absolute miss, the band
 * width that would have held 80%, and how often the owner's tap agreed with the card.
 */
import { db } from "../lib/db";
import { calibrateBand, dayRatio, scoreDay } from "../lib/forecast";
import { observationsFor } from "../lib/observe";
import { addDays, localDate } from "../lib/time";

async function main() {
  const only = process.argv[2];
  const q = db().from("places").select("place_id, name, timezone");
  const { data: places, error } = only ? await q.eq("place_id", only) : await q;
  if (error) throw new Error(error.message);

  for (const p of places ?? []) {
    const to = localDate(p.timezone);
    const from = addDays(to, -60);
    const [obs, { data: fcs }, { data: taps }] = await Promise.all([
      observationsFor(p.place_id, from, to),
      db().from("forecasts").select("date, hourly, band").eq("place_id", p.place_id).gte("date", from).lte("date", to),
      db().from("taps").select("date, value").eq("place_id", p.place_id).gte("date", from).lte("date", to),
    ]);
    let n = 0,
      inside = 0,
      absMiss = 0,
      agree = 0,
      tapped = 0;
    const pairs: { live: number; forecast: number }[] = [];
    for (const r of fcs ?? []) {
      const h = r.hourly as any;
      const dayObs = obs.filter((o) => o.date === r.date);
      const s = scoreDay(h, dayObs);
      if (s) {
        n += s.n;
        inside += s.inside;
      }
      for (const o of dayObs) {
        const f = h.hourly[o.hour];
        if (o.live === null || typeof f !== "number" || f < 10) continue;
        absMiss += Math.abs(o.live / f - 1);
        pairs.push({ live: o.live, forecast: f });
      }
      const t = (taps ?? []).find((x) => x.date === r.date);
      if (t) {
        tapped++;
        const ratio = dayRatio(h);
        const said = ratio >= 1.05 ? 1 : ratio <= 0.95 ? -1 : 0;
        if (said === t.value) agree++;
      }
    }
    const cal = calibrateBand(pairs);
    console.log(
      [
        `${p.name} (${p.place_id})`,
        `  cards ${fcs?.length ?? 0}, live readings scored ${n}`,
        n ? `  inside band ${Math.round((inside / n) * 100)}% (aim 80%), mean miss ${Math.round((absMiss / pairs.length) * 100)}%` : "  no live readings yet",
        cal ? `  band that holds 80%: ±${Math.round(cal.band * 100)}% (from ${cal.n} readings)` : "",
        tapped ? `  owner agreed with ${agree} of ${tapped} cards` : "  no taps yet",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
