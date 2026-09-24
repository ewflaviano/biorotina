self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() || {};
  const medication = payload.kind === "medication";
  const habit = payload.kind === "habit";
  event.waitUntil(
    self.registration.showNotification("Biorotina", {
      body: medication
        ? "Esse é o seu lembrete para tomar o seu remédio."
        : habit
          ? "Esse é o seu lembrete para praticar um bom hábito."
          : "Esse é o seu lembrete para beber água.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `biorotina-reminder-${payload.kind || "hydration"}`,
      data: { url: medication ? "/#/medicamentos" : habit ? "/#/habitos" : "/#/hidratacao" },
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
        if (open) {
          const page = await open.navigate(
            new URL(event.notification.data.url, self.location.origin).href,
          );
          return (page || open).focus();
        }
        return self.clients.openWindow(event.notification.data.url);
      }),
  );
});
