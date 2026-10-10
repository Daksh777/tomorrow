import { dayRatio, scoreDay } from "@/lib/forecast";
import { dateLocale, ui } from "@/lib/ui";
import type { Language, Level, Observation } from "@/lib/types";
import type { DayForecast } from "./TodayCheck";

export interface RecapDay {
  forecast: DayForecast;
  tap: number | null;
  observations: Observation[];
}

const SAID = (r: number) => (r >= 1.05 ? 1 : r <= 0.95 ? -1 : 0);
const WORD: Record<number, Level> = { [-1]: "quieter", 0: "usual", 1: "busier" };

/**
 * How we did over the last week: what the card said, what the owner tapped, and how many of Google's
 * live readings landed inside the band. Shown once there is at least one scored day.
 */
export default function WeekRecap({ days, lang = "en" }: { days: RecapDay[]; lang?: Language }) {
  const t = ui(lang);
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
      <h2 className="text-base font-semibold">{t.howWeDid}</h2>
      <p className="mt-0.5 text-sm text-ink/60">
        {[
          tapped.length ? t.agreed(agreed, tapped.length) : null,
          n ? t.insidePct(Math.round((inside / n) * 100)) : null,
        ]
          .filter(Boolean)
          .join(lang === "en" ? ". " : " · ")}
        {lang === "en" ? "." : ""}
      </p>
      <table className="mt-3 w-full text-left text-sm tabular">
        <thead className="text-xs text-ink/50">
          <tr>
            <th className="pb-1.5 font-normal">{t.colDay}</th>
            <th className="pb-1.5 font-normal">{t.colWeSaid}</th>
            <th className="pb-1.5 font-normal">{t.colYouSaid}</th>
            <th className="pb-1.5 text-right font-normal">{t.colLive}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-t border-ink/[0.07]">
              <td className="py-1.5 font-mono text-xs">
                {new Date(`${r.date}T12:00:00`).toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric" })}
              </td>
              <td className="py-1.5">{t.level[WORD[r.said]]}</td>
              <td className={`py-1.5 ${r.tap !== null && r.tap !== r.said ? "text-busy" : ""}`}>{r.tap === null ? "–" : t.level[WORD[r.tap]]}</td>
              <td className="py-1.5 text-right font-mono text-xs">{r.score ? `${r.score.inside}/${r.score.n}` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
