// Immer neueste Version: Same-Origin-Dateien werden bei jedem Laden beim Server geprüft (ETag), nie blind aus dem HTTP-Cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === "GET" && u.origin === location.origin) e.respondWith(fetch(e.request, { cache: "no-cache" }));
});
