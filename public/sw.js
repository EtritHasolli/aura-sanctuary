const CACHE_VERSION = "aura-v1";

// Take control immediately on install — don't wait for tabs to close.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Claim all existing clients so this SW controls them right away.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal fetch handler — required so browsers keep the SW registered as a
// "functional" service worker (some browsers unregister SWs with no fetch
// handler, which breaks push delivery).
self.addEventListener("fetch", () => {
  // Passthrough — we don't need offline caching, just push support.
});

self.addEventListener("push", (event) => {
  const raw = event.data ? event.data.text() : null;

  let payload;
  try {
    payload = JSON.parse(raw ?? "");
  } catch {
    payload = { title: "Aura", body: raw ?? "New notification" };
  }

  const title = payload.title ?? "Aura";
  const options = {
    body: payload.body ?? "",
    icon: "/aura-logo-full.png",
    badge: "/aura-logo.png",
    tag: payload.tag ?? "aura-default",
    renotify: true,
    data: { url: payload.url ?? "/" },
    // Show even when the app is in the foreground on mobile
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url ?? "/";
  const fullUrl = path.startsWith("http") ? path : self.location.origin + path;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            // Navigate the existing window and dispatch the in-app navigate event
            return client
              .navigate(fullUrl)
              .then((c) => {
                c?.focus();
                // postMessage lets the app router pick up the URL change
                c?.postMessage({ type: "aura:navigate", url: path });
              });
          }
        }
        if (clients.openWindow) return clients.openWindow(fullUrl);
      })
  );
});
