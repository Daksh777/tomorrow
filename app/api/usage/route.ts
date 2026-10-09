import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * SerpApi spend: calls in the last 30 days by kind and by place (from serp_log), and what SerpApi says
 * is left this month (account API, free). Protected by CRON_SECRET like the crons.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data, error } = await db().from("serp_log").select("kind, place_id, ok, at").gte("at", since).limit(50000);
  const byKind: Record<string, number> = {};
  const byPlace: Record<string, number> = {};
  let failed = 0;
  for (const r of data ?? []) {
    byKind[r.kind ?? "?"] = (byKind[r.kind ?? "?"] ?? 0) + 1;
    byPlace[r.place_id ?? "(no place)"] = (byPlace[r.place_id ?? "(no place)"] ?? 0) + 1;
    if (!r.ok) failed++;
  }
  let account: Record<string, unknown> | null = null;
  try {
    const r = await fetch(`https://serpapi.com/account.json?api_key=${process.env.SERPAPI_API_KEY}`);
    if (r.ok) {
      const j: any = await r.json();
      account = {
        plan: j.plan_name,
        searches_per_month: j.searches_per_month,
        this_month_usage: j.this_month_usage,
        searches_left: j.plan_searches_left ?? j.total_searches_left,
      };
    }
  } catch {
    /* account info is optional */
  }
  return NextResponse.json({ last30Days: { calls: data?.length ?? 0, failed, byKind, byPlace }, account, ...(error ? { logError: error.message } : {}) });
}
