import { getJson } from "serpapi";
import fs from "node:fs";
import path from "node:path";

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

  const res = await getJson(clean);

  if (process.env.SAVE_FIXTURES === "1") saveFixture(params, res);
  return res;
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
