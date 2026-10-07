/**
 * Clear taps, learned/owner weights and stored forecasts for one place (or all places with --all),
 * so a test run starts clean. Places and the signal cache are kept.
 *
 *   npm run reset-test -- <place_id>
 *   npm run reset-test -- --all
 */
import { db } from "../lib/db";

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Usage: npm run reset-test -- <place_id> | --all");
  const sb = db();
  for (const table of ["taps", "weights", "forecasts"]) {
    const q = sb.from(table).delete();
    const { error } = arg === "--all" ? await q.neq("place_id", "") : await q.eq("place_id", arg);
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log("cleared", table);
  }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
