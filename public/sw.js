self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() || {};
  const medication = payload.kind === "medication";
  event.waitUntil(
    self.registration.showNotification("Biorotina", {
      body: medication
        ? "Esse é o seu lembrete para tomar o seu remédio."
        : "Esse é o seu lembrete para beber água.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "biorotina-reminder",
      data: { url: medication ? "/medicamentos" : "/hidratacao" },
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
        return self.clients.openWindow(event.notification.data.url);
      }),
  );
});
