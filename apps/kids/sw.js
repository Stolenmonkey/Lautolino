// Offline-Hülle: Netz zuerst (immer neueste Version, am HTTP-Cache vorbei), Speicher nur als Offline-Rückfall.
// Server-Anfragen (andere Adresse) laufen nie über diesen Speicher.
const NAME = "silbenzauber-kind-v6", FILES = ["./", "index.html", "style.css", "config.js", "dist/app.js", "lautolino-logo.jpg", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(NAME).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    if (r.ok) { const k = r.clone(); caches.open(NAME).then((c) => c.put(e.request, k)); }
    return r;
  }).catch(() => caches.open(NAME).then((c) => c.match(e.request))));
});
