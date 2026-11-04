// Offline-Hülle: App-Dateien werden gemerkt und beim nächsten Start sofort geladen (und im Hintergrund erneuert).
// Server-Anfragen (andere Adresse) laufen nie über diesen Speicher.
const NAME = "silbenzauber-kind-v1", FILES = ["./", "index.html", "style.css", "config.js", "dist/app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(NAME).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(caches.open(NAME).then((c) => c.match(e.request).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
