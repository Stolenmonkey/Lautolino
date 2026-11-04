// Dünner Client für den Silbenflug-Server. Läuft im Browser und in Node (für Tests).
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function createApi({ base, storage, fetchFn }) {
  const KEY = "silbenflug.token";
  const api = {
    get token() { return storage.getItem(KEY); },
    set token(v) { v ? storage.setItem(KEY, v) : storage.removeItem(KEY); },
    async request(method, path, body) {
      let res;
      try {
        res = await (fetchFn || fetch)(base.replace(/\/+$/, "") + path, { method, headers: { "content-type": "application/json", ...(api.token ? { authorization: "Bearer " + api.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch { throw new ApiError(0, "Keine Verbindung zum Server"); }
      const text = await res.text(); let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* keine JSON-Antwort */ }
      if (!res.ok) throw new ApiError(res.status, (json && json.error) || "Fehler " + res.status);
      return json;
    },
    get: (p) => api.request("GET", p), post: (p, b) => api.request("POST", p, b ?? {}),
    put: (p, b) => api.request("PUT", p, b ?? {}), patch: (p, b) => api.request("PATCH", p, b ?? {}),
    async login(email, password) { const r = await api.post("/auth/login", { email, password }); api.token = r.token; return r.user; },
    async logout() { try { await api.post("/auth/logout"); } catch { /* egal */ } api.token = null; },
  };
  return api;
}
