import webpush from "web-push";
import { db } from "./db";
import type { Copy } from "./types";

let ready: boolean | undefined;

/** VAPID keys come from the environment (see .env.example). Without them push is off, quietly. */
function setup(): boolean {
  if (ready !== undefined) return ready;
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  ready = !!(pub && priv);
  if (ready) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:tomorrow@users.noreply.github.com", pub!, priv!);
  return ready;
}

export function pushEnabled(): boolean {
  return setup();
}

/** Send tomorrow's headline to every phone following the place. Dead subscriptions are removed. */
export async function pushCard(place_id: string, placeName: string, copy: Copy): Promise<number> {
  if (!setup()) return 0;
  const { data, error } = await db().from("push_subscriptions").select("endpoint, subscription").eq("place_id", place_id);
  if (error || !data?.length) return 0;
  const body = JSON.stringify({
    title: `Tomorrow at ${placeName}`,
    body: `${copy.headline} ${copy.actions[0]}`,
    url: `/p/${encodeURIComponent(place_id)}`,
  });
  let sent = 0;
  for (const row of data) {
    try {
      await webpush.sendNotification(row.subscription as any, body, { TTL: 6 * 3600 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db().from("push_subscriptions").delete().eq("endpoint", row.endpoint);
    }
  }
  return sent;
}
