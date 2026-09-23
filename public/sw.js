self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Biorotina", {
      body: "Você tem um lembrete. Abra o app para conferir sua rotina.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "biorotina-reminder",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const open = windows.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (open) return open.focus();
        return self.clients.openWindow("/");
      }),
  );
});
