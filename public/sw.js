// Tomorrow's service worker: the evening card notification, and the last card you opened, offline.
const CACHE = "tomorrow-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Pages and their scripts: network first, the cached copy when offline (a café basement, a bad signal).
// API calls are never cached: they spend searches or change data.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const page = req.mode === "navigate";
  const asset = url.pathname.startsWith("/_next/static/") || url.pathname === "/icon" || url.pathname === "/manifest.webmanifest";
  if (!page && !asset) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (page ? caches.match("/") : undefined)).then((hit) => hit || Response.error())),
  );
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Tomorrow", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tomorrow", {
      body: data.body || "Tomorrow's card is ready.",
      icon: "/icon",
      badge: "/icon",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.endsWith(url) && "focus" in c) return c.focus();
      return clients.openWindow(url);
    }),
  );
});
