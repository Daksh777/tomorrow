import { db } from "@/lib/db";
import { getCard } from "@/lib/card";
import { localDate } from "@/lib/time";
import EveningCard from "@/components/EveningCard";
import MorningTap from "@/components/MorningTap";
import WeekStrip from "@/components/WeekStrip";

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
  if (!card) return <p className="mt-10 text-sm">We don't know that place yet. <a className="underline" href="/onboarding">Set it up</a>.</p>;

  // Yesterday's forecast is today's date; offer the tap only if one exists and is unanswered.
  const today = localDate(card.place.timezone);
  const sb = db();
  const [{ data: fc }, { data: tap }] = await Promise.all([
    sb.from("forecasts").select("date").eq("place_id", placeId).eq("date", today).maybeSingle(),
    sb.from("taps").select("date").eq("place_id", placeId).eq("date", today).maybeSingle(),
  ]);

  return (
    <main>
      {fc && !tap && <MorningTap placeId={placeId} date={today} />}
      <div className={fc && !tap ? "mt-4" : ""}>
        <EveningCard
          placeName={card.place.name}
          placeId={placeId}
          forecast={card.forecast}
          copy={card.copy}
          warnings={card.warnings}
        />
      </div>
      <WeekStrip placeId={placeId} />
    </main>
  );
}
