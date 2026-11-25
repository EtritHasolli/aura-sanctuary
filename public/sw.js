const CACHE_VERSION = "aura-v2";

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

// The DB trigger sends the notification type ("info", "success", …) as the tag.
// Notifications sharing a tag replace each other in the OS tray, so give those a
// unique tag; explicit tags (e.g. "quest-<id>") still collapse duplicates on purpose.
const GENERIC_TAGS = new Set(["info", "success", "warning", "aura", "aura-default"]);

function uniqueTag() {
  return `aura-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

self.addEventListener("push", (event) => {
  const raw = event.data ? event.data.text() : null;

  let payload;
  try {
    payload = JSON.parse(raw ?? "");
  } catch {
    payload = { title: "Aura", body: raw ?? "New notification" };
  }

  const title = payload.title ?? "Aura";
  const tag = payload.tag && !GENERIC_TAGS.has(payload.tag) ? payload.tag : uniqueTag();
  const options = {
    body: payload.body ?? "",
    icon: "/aura-logo-full.png",
    badge: "/aura-logo.png",
    tag,
    renotify: true,
    data: { url: payload.url ?? "/" },
    // Show even when the app is in the foreground on mobile
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/** Only ever navigate within the app — never to a URL supplied by a payload's host. */
function inAppPath(url) {
  try {
    const parsed = new URL(url || "/", self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = inAppPath(event.notification.data?.url);

  event.waitUntil(
    (async () => {
      const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = list.find((c) => c.url.startsWith(self.location.origin));
      if (client) {
        // Route in place (no reload) so an ongoing study call or music isn't interrupted.
        try {
          await client.focus();
        } catch {
          // Focus can be refused; navigation below still happens.
        }
        client.postMessage({ type: "aura:navigate", url: path });
        return;
      }
      if (clients.openWindow) await clients.openWindow(path);
    })(),
  );
});
