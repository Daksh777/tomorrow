import { db } from "@/lib/db";
import { getCard } from "@/lib/card";
import { fmtHour, localDate } from "@/lib/time";
import { newsCheckedAt } from "@/lib/signals/news";
import EveningCard from "@/components/EveningCard";
import MorningTap from "@/components/MorningTap";
import WeekStrip from "@/components/WeekStrip";
import TopBar from "@/components/TopBar";

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
  const yesterday = localDate(card.place.timezone, -1);
  const sb = db();
  const [{ data: fc }, { data: tap }, checkedAt] = await Promise.all([
    sb.from("forecasts").select("date").eq("place_id", placeId).eq("date", yesterday).maybeSingle(),
    sb.from("taps").select("value").eq("place_id", placeId).eq("date", yesterday).maybeSingle(),
    newsCheckedAt(card.place.city),
  ]);

  return (
    <main>
      <TopBar current={{ id: placeId, name: card.place.name, where: [card.place.area, card.place.city].filter(Boolean).join(", ") }} />
      {fc && <MorningTap placeId={placeId} date={yesterday} answered={tap?.value ?? null} />}
      <div className={fc ? "mt-3" : ""}>
        <EveningCard
          placeId={placeId}
          forecast={card.forecast}
          copy={card.copy}
          warnings={card.warnings}
          newsChecked={checkedAt ? checkedLabel(checkedAt, card.place.timezone) : null}
        />
      </div>
      <WeekStrip placeId={placeId} />
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
