import { getJson } from "serpapi";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

type Params = Record<string, string | number | boolean | undefined>;

/**
 * Single entry point for every SerpApi call. Real responses only.
 * Set SAVE_FIXTURES=1 to write each raw response to /fixtures for tests.
 */
export async function serp(params: Params): Promise<any> {
  const api_key = process.env.SERPAPI_API_KEY;
  if (!api_key) throw new Error("SERPAPI_API_KEY is not set");

  if (params.engine === "google_events") {
    // Deprecated engine. Events come from engine=google (events_results).
    throw new Error("engine=google_events is deprecated; use engine=google");
  }

  const clean: Record<string, any> = { api_key };
  for (const [k, v] of Object.entries(params)) if (v !== undefined) clean[k] = v;

  let res: any;
  try {
    res = await getJson(clean);
  } catch (e) {
    await logCall(params, false);
    throw e;
  }
  await logCall(params, true);

  if (process.env.SAVE_FIXTURES === "1") saveFixture(params, res);
  return res;
}

/** Which place a run of calls is for, so the log can show what each place costs. */
const context = new AsyncLocalStorage<{ place_id?: string }>();
export function forPlace<T>(place_id: string, fn: () => Promise<T>): Promise<T> {
  return context.run({ place_id }, fn);
}

/** What a call was for, from its parameters (never the key). */
export function callKind(p: Params): string {
  const q = String(p.q ?? "").toLowerCase();
  switch (p.engine) {
    case "google_maps":
      return p.place_id ? "place" : "maps search";
    case "google":
      return q.includes("weather") ? "weather" : q.includes("event") ? "events" : "google";
    case "google_news":
      return "news";
    case "google_sports":
      return "matches";
    case "google_hotels":
      return "hotels";
    case "google_trends":
      return "trends";
    default:
      return String(p.engine);
  }
}

/** One row per call in serp_log. Best-effort: a missing table never breaks a search. */
async function logCall(params: Params, ok: boolean): Promise<void> {
  if (process.env.SERP_LOG === "0" || !process.env.SUPABASE_URL) return;
  try {
    const { db } = await import("./db");
    await db().from("serp_log").insert({ engine: String(params.engine), kind: callKind(params), place_id: context.getStore()?.place_id ?? null, ok });
  } catch {
    /* logging is optional */
  }
}

function saveFixture(params: Params, res: unknown) {
  try {
    const dir = path.join(process.cwd(), "fixtures");
    fs.mkdirSync(dir, { recursive: true });
    const tag = [params.engine, params.type, params.q ?? params.place_id ?? params.kgmid]
      .filter(Boolean)
      .join("_")
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, 80);
    fs.writeFileSync(
      path.join(dir, `${tag}-${Date.now()}.json`),
      JSON.stringify(res, null, 2),
    );
  } catch {
    /* fixtures are best-effort */
  }
}
