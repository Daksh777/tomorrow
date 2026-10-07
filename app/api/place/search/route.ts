import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/place";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });
  try {
    const hits = await searchPlaces(q, searchParams.get("ll") ?? undefined);
    return NextResponse.json({ hits });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
