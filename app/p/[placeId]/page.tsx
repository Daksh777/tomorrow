import { db } from "@/lib/db";
import { getCard } from "@/lib/card";
import { addDays, fmtHour, localDate, localHour } from "@/lib/time";
import { observationsFor } from "@/lib/observe";
import { newsCheckedAt } from "@/lib/signals/news";
import EveningCard from "@/components/EveningCard";
import MorningTap from "@/components/MorningTap";
import WeekStrip from "@/components/WeekStrip";
import TopBar from "@/components/TopBar";
import TodayCheck, { type DayForecast } from "@/components/TodayCheck";
import WeekRecap, { type RecapDay } from "@/components/WeekRecap";
import PlaceSettings from "@/components/PlaceSettings";
import OwnerPlans from "@/components/OwnerPlans";
import { ownerEvents } from "@/lib/ownerEvents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PlacePage({ params }: { params: Promise<{ placeId: string }> }) {
  const placeId = decodeURIComponent((await params).placeId);

  let card;
  try {
    card = await getCard(placeId);
  } catch (e: any) {
    return <p className="mt-10 text-sm text-busy">Could not build tomorrow's card: {e.message}</p>;
  }
  if (!card) return <p className="mt-10 text-sm">We don't know that place yet. <a className="underline" href="/">Set it up</a>.</p>;

  // "How was yesterday?" is about yesterday's date: it trains the pins that were on yesterday's card.
  const tz = card.place.timezone;
  const today = localDate(tz);
  const yesterday = localDate(tz, -1);
  const weekAgo = addDays(today, -7);
  const sb = db();
  // Last week's stored cards, taps and Google live readings: today's panel and the recap.
  const [{ data: fcs }, { data: taps }, obs, checkedAt, plans] = await Promise.all([
    sb.from("forecasts").select("date, hourly").eq("place_id", placeId).gte("date", weekAgo).lte("date", today).order("date"),
    sb.from("taps").select("date, value").eq("place_id", placeId).gte("date", weekAgo).lte("date", today),
    observationsFor(placeId, weekAgo, today),
    newsCheckedAt(card.place.city),
    ownerEvents(placeId),
  ]);
  // Upcoming plans only: one-offs from today on, and every weekly one.
  const upcoming = plans.filter((e) => e.weekly || e.date >= today);
  const days: DayForecast[] = (fcs ?? []).map((r: any) => ({ date: r.date, hourly: r.hourly.hourly, lo: r.hourly.lo, hi: r.hourly.hi, baseline: r.hourly.baseline }));
  const fc = days.find((d) => d.date === yesterday);
  const todayFc = days.find((d) => d.date === today);
  const tap = (taps ?? []).find((t: any) => t.date === yesterday);
  const recap: RecapDay[] = days
    .filter((d) => d.date < today)
    .map((d) => ({
      forecast: d,
      tap: (taps ?? []).find((t: any) => t.date === d.date)?.value ?? null,
      observations: obs.filter((o) => o.date === d.date),
    }));
  const locked = !!card.place.edit_key_hash;

  return (
    <main>
      <TopBar current={{ id: placeId, name: card.place.name, where: [card.place.area, card.place.city].filter(Boolean).join(", ") }} />
      {fc && <MorningTap placeId={placeId} date={yesterday} answered={tap?.value ?? null} locked={locked} />}
      <div className={fc ? "mt-3" : ""}>
        <EveningCard
          placeId={placeId}
          placeName={card.place.name}
          forecast={card.forecast}
          copy={card.copy}
          warnings={card.warnings}
          newsChecked={checkedAt ? checkedLabel(checkedAt, tz) : null}
          units={{ usual_daily: card.place.usual_daily ?? null, unit: card.place.unit ?? null }}
          locked={locked}
        />
      </div>
      {todayFc && (
        <div className="mt-3">
          <TodayCheck placeId={placeId} forecast={todayFc} observations={obs.filter((o) => o.date === today)} hourNow={localHour(tz)} />
        </div>
      )}
      <OwnerPlans placeId={placeId} locked={locked} events={upcoming} tomorrow={localDate(tz, 1)} />
      <WeekStrip placeId={placeId} />
      <WeekRecap days={recap} />
      <a
        href={`/p/${encodeURIComponent(placeId)}/moves`}
        className="mt-3 flex items-center justify-between rounded-xl border border-ink/[0.07] bg-surface px-5 py-4 text-base font-semibold transition-colors active:bg-paper"
      >
        What moves your place
        <span aria-hidden className="text-ink/40">→</span>
      </a>
      <PlaceSettings
        placeId={placeId}
        locked={locked}
        language={card.place.language ?? "en"}
        usualDaily={card.place.usual_daily ?? null}
        unit={card.place.unit ?? null}
      />
    </main>
  );
}

/** "6:04 pm" today, "8 Oct, 6:04 pm" otherwise, in the place's timezone. */
function checkedLabel(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const time = fmtHour(Number(parts.hour) + Number(parts.minute) / 60);
  if (localDate(tz, 0, d) === localDate(tz)) return time;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  return `${day}, ${time}`;
}
