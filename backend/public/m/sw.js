/* Clara service worker — turns a Web-Push into an incoming-call notification.
 *
 * Styling limits we work WITH, not against:
 *  - Android/Chrome: action buttons ("Annehmen"/"Ablehnen"), vibration pattern,
 *    requireInteraction (stays on screen like a ringing call).
 *  - iOS (installierte PWA, ab 16.4): keine Action-Buttons, kein eigener Ton,
 *    keine Vibration aus dem SW — dafür Standard-Benachrichtigungston, Banner
 *    mit App-Icon und Titel "Clara ruft an". Antippen öffnet die Anrufmaske,
 *    die wie ein Telefonat aussieht und nach einem Tipp spricht.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function parsePayload(event) {
  try { return event.data ? event.data.json() : {}; } catch { return {}; }
}

self.addEventListener("push", (event) => {
  const p = parsePayload(event);

  // Info-Push (z.B. Kontaktkarte): normale Benachrichtigung, kein "Anruf".
  if (p.kind === "clara_note") {
    const options = {
      body: p.reason || "",
      icon: "/m/icon-192.png",
      badge: "/m/icon-96.png",
      image: p.image || undefined,
      tag: "clara-note",
      renotify: true,
      timestamp: p.ts || Date.now(),
      vibrate: [200, 100, 200],
      data: { url: p.url || "" },
    };
    event.waitUntil(self.registration.showNotification(p.title || "Clara", options));
    return;
  }

  const title = p.title || "Clara ruft an";
  const reason = p.reason || "Clara möchte dich sprechen";
  const url = p.url || "/m/call.html";

  const options = {
    body: reason,
    icon: "/m/icon-192.png",
    badge: "/m/icon-96.png",
    tag: "clara-call",          // a second call replaces the first (no stacking)
    renotify: true,             // ...but still rings again
    requireInteraction: true,   // Android: stay visible like a ringing phone
    vibrate: [400, 150, 400, 150, 400, 150, 800], // ringtone-like buzz (Android)
    timestamp: p.ts || Date.now(),
    data: { url },
    actions: [
      { action: "accept", title: "🟢 Annehmen" },
      { action: "decline", title: "🔴 Ablehnen" },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "decline") return; // red button: just dismiss

  // Info-Notifications tragen ihre Ziel-URL selbst; ohne Ziel nur schließen
  // (NICHT auf die Anrufmaske fallen — das würde Clara anwählen).
  const isNote = event.notification.tag === "clara-note";
  const dataUrl = (event.notification.data && event.notification.data.url) || "";
  if (isNote && !dataUrl) return;
  const url = dataUrl || "/m/call.html";
  event.waitUntil((async () => {
    // Reuse an open Clara window if there is one (avoids stacking tabs).
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if (c.url.includes("/m/") && "focus" in c) {
        try {
          await c.focus();
          if ("navigate" in c) await c.navigate(url);
          return;
        } catch { /* fall through to openWindow */ }
      }
    }
    await self.clients.openWindow(url);
  })());
});
