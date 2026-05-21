self.addEventListener("push", (event) => {
  const raw = event.data ? event.data.text() : null;
  console.log("[sw] push received, raw:", raw);

  let payload;
  try {
    payload = JSON.parse(raw ?? "");
  } catch {
    payload = { title: "Aura", body: raw ?? "New notification" };
  }

  console.log("[sw] payload:", JSON.stringify(payload));

  const title = payload.title ?? "Aura";
  const options = {
    body: payload.body ?? "",
    icon: "/aura-logo-full.png",
    badge: "/aura-logo.png",
    tag: payload.tag ?? "aura-default",
    renotify: true,
    data: { url: payload.url ?? "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url ?? "/";
  const fullUrl = path.startsWith("http") ? path : self.location.origin + path;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.navigate(fullUrl).then((c) => c?.focus());
        }
      }
      if (clients.openWindow) return clients.openWindow(fullUrl);
    })
  );
});
