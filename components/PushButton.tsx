"use client";

import { useEffect, useState } from "react";
import { Bell, BellSlash } from "@phosphor-icons/react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * "Send me this every evening": Web Push from the nightly build. Hidden where the browser can't do it
 * (on iPhone, push needs the app added to the Home Screen first) or the server has no VAPID key.
 */
export default function PushButton({ placeId }: { placeId: string }) {
  const [support, setSupport] = useState<"unknown" | "no" | "ios-install" | "yes">("unknown");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!VAPID) return setSupport("no");
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setSupport(ios && !standalone ? "ios-install" : "no");
    setSupport("yes");
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setOn(!!sub && localStorage.getItem(`tomorrow.push.${placeId}`) === "1"))
      .catch(() => {});
  }, [placeId]);

  async function toggle() {
    setBusy(true);
    setErr("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (on) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
          await sub.unsubscribe();
        }
        localStorage.removeItem(`tomorrow.push.${placeId}`);
        setOn(false);
      } else {
        if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site.");
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID!) as BufferSource }));
        const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place_id: placeId, subscription: sub.toJSON() }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not turn on reminders.");
        localStorage.setItem(`tomorrow.push.${placeId}`, "1");
        setOn(true);
      }
    } catch (e: any) {
      setErr(e.message ?? "Could not change reminders.");
    }
    setBusy(false);
  }

  if (support === "unknown" || support === "no") return null;
  if (support === "ios-install") {
    return <p className="mt-3 text-xs text-ink/50">To get this card every evening, add Tomorrow to your Home Screen (Share, then Add to Home Screen).</p>;
  }
  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-medium transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {on ? <BellSlash size={16} weight="bold" /> : <Bell size={16} weight="bold" />}
        {busy ? "…" : on ? "Stop the evening card" : "Send me this card every evening"}
      </button>
      {err && <p className="mt-1.5 text-xs text-busy">{err}</p>}
    </div>
  );
}
