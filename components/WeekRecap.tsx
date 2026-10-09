import { dayRatio, scoreDay } from "@/lib/forecast";
import type { Observation } from "@/lib/types";
import type { DayForecast } from "./TodayCheck";

export interface RecapDay {
  forecast: DayForecast;
  tap: number | null;
  observations: Observation[];
}

const SAID = (r: number) => (r >= 1.05 ? 1 : r <= 0.95 ? -1 : 0);
const WORD: Record<number, string> = { [-1]: "quieter", 0: "usual", 1: "busier" };

/**
 * How we did over the last week: what the card said, what the owner tapped, and how many of Google's
 * live readings landed inside the band. Shown once there is at least one scored day.
 */
export default function WeekRecap({ days }: { days: RecapDay[] }) {
  const rows = days
    .map((d) => {
      const said = SAID(dayRatio(d.forecast));
      const score = scoreDay(d.forecast, d.observations);
      return { date: d.forecast.date, said, tap: d.tap, score };
    })
    .filter((r) => r.tap !== null || r.score);
  if (!rows.length) return null;

  const tapped = rows.filter((r) => r.tap !== null);
  const agreed = tapped.filter((r) => r.tap === r.said).length;
  const n = rows.reduce((a, r) => a + (r.score?.n ?? 0), 0);
  const inside = rows.reduce((a, r) => a + (r.score?.inside ?? 0), 0);

  return (
    <section className="mt-3 rounded-xl border border-ink/[0.07] bg-surface p-5">
      <h2 className="text-base font-semibold">How we did this week</h2>
      <p className="mt-0.5 text-sm text-ink/60">
        {[
          tapped.length ? `You agreed with ${agreed} of ${tapped.length} ${tapped.length === 1 ? "card" : "cards"}` : null,
          n ? `${Math.round((inside / n) * 100)}% of Google's live readings fell inside the forecast (aim: 80%)` : null,
        ]
          .filter(Boolean)
          .join(". ")}
        .
      </p>
      <table className="mt-3 w-full text-left text-sm tabular">
        <thead className="text-xs text-ink/50">
          <tr>
            <th className="pb-1.5 font-normal">Day</th>
            <th className="pb-1.5 font-normal">We said</th>
            <th className="pb-1.5 font-normal">You said</th>
            <th className="pb-1.5 text-right font-normal">Live inside</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-t border-ink/[0.07]">
              <td className="py-1.5 font-mono text-xs">
                {new Date(`${r.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
              </td>
              <td className="py-1.5">{WORD[r.said]}</td>
              <td className={`py-1.5 ${r.tap !== null && r.tap !== r.said ? "text-busy" : ""}`}>{r.tap === null ? "–" : WORD[r.tap]}</td>
              <td className="py-1.5 text-right font-mono text-xs">{r.score ? `${r.score.inside}/${r.score.n}` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
