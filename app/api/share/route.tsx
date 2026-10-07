import { ImageResponse } from "@vercel/og";
import { getCard } from "@/lib/card";
import { curveGeometry } from "@/lib/curve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Staff WhatsApp card: headline, curve with band, pins and the two actions, as a PNG. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const place_id = sp.get("place_id");
  if (!place_id) return new Response("place_id is required", { status: 400 });
  const card = await getCard(place_id, sp.get("date") ?? undefined);
  if (!card) return new Response("unknown place", { status: 404 });

  const { place, forecast: f, copy } = card;
  const W = 1000;
  const g = curveGeometry(f, W - 120, 300, 10);
  const day = f.weekday[0].toUpperCase() + f.weekday.slice(1);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f6f4ef",
          color: "#14181f",
          padding: 60,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#6b7280" }}>
          {place.name} · {day} {f.date.slice(5)}
        </div>
        <div style={{ display: "flex", fontSize: 58, fontWeight: 700, marginTop: 20, lineHeight: 1.1 }}>
          {copy.headline}
        </div>

        <svg width={g.width} height={g.height} style={{ marginTop: 30 }}>
          <path d={g.band} fill="#e8a33d" fillOpacity={0.3} />
          <path d={g.baseline} fill="none" stroke="#9ca3af" strokeWidth={3} />
          <path d={g.forecast} fill="none" stroke="#14181f" strokeWidth={5} />
        </svg>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
          {f.pins.slice(0, 4).map((p, i) => (
            <div key={i} style={{ display: "flex", fontSize: 28, marginTop: 8 }}>
              <span style={{ color: p.effect > 0 ? "#b45309" : "#2563eb", fontWeight: 700, width: 36 }}>
                {p.effect > 0 ? "+" : p.effect < 0 ? "−" : "·"}
              </span>
              <span>
                {p.label}
                {p.distanceKm !== null ? ` · ${Math.round(p.distanceKm * 1000)} m` : ""}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", borderTop: "3px solid #14181f", paddingTop: 24 }}>
          {copy.actions.map((a, i) => (
            <div key={i} style={{ display: "flex", fontSize: 34, fontWeight: 600, marginTop: 8 }}>
              {i + 1}. {a}
            </div>
          ))}
          <div style={{ display: "flex", fontSize: 22, color: "#6b7280", marginTop: 20 }}>
            Tomorrow · {f.tuned ? "Tuned to your place" : "Learning your place"}
          </div>
        </div>
      </div>
    ),
    { width: 1000, height: 1000 },
  );
}
