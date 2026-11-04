// Server-Zugriff und Offline-Puffer der Kinder-App.
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export type FetchFn = (url: string, init?: any) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function createKidsApi(o: { base: string; fetchFn?: FetchFn }) {
  const api = {
    token: null as string | null,
    async request(method: string, path: string, body?: unknown): Promise<any> {
      let res;
      try {
        res = await (o.fetchFn || (fetch as unknown as FetchFn))(o.base.replace(/\/+$/, "") + path, { method, headers: { "content-type": "application/json", ...(api.token ? { authorization: "Bearer " + api.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch { throw new ApiError(0, "Keine Verbindung zum Server"); }
      const text = await res.text(); let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* keine JSON-Antwort */ }
      if (!res.ok) throw new ApiError(res.status, (json && json.error) || "Fehler " + res.status);
      return json;
    },
    get: (p: string) => api.request("GET", p),
    post: (p: string, b?: unknown) => api.request("POST", p, b ?? {}),
  };
  return api;
}
export type KidsApi = ReturnType<typeof createKidsApi>;

// Eine fertige Runde wartet im Puffer, bis der Server sie bestätigt hat. clientRoundId macht das Senden wiederholbar (der Server erkennt Doppelte).
export interface QueuedRound { clientRoundId: string; seconds: number; syllables: Array<{ s: string; sec: number }>; letters: string[]; lengths: number[]; playedAt: string; autoState: { key: string; bal: number; sd: number } }

export type FlushResult = { sent: number; left: number; authLost: boolean; offline: boolean };
// Sendet den Puffer der Reihe nach. Netzfehler oder Serverfehler: Rest bleibt liegen. 401: Anmeldung abgelaufen, Rest bleibt liegen.
// Eine vom Server als ungültig abgelehnte Runde (400/403/404/409/413) blockiert den Puffer nicht und wird verworfen. 429 und 5xx werden später erneut versucht.
export async function flushQueue(api: KidsApi, queue: QueuedRound[]): Promise<{ queue: QueuedRound[]; result: FlushResult }> {
  const q = queue.slice(); let sent = 0;
  while (q.length) {
    try { await api.post("/student/rounds", q[0]); q.shift(); sent++; }
    catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      if (s === 401) return { queue: q, result: { sent, left: q.length, authLost: true, offline: false } };
      if (s === 0 || s === 429 || s >= 500) return { queue: q, result: { sent, left: q.length, authLost: false, offline: s === 0 } };
      q.shift();
    }
  }
  return { queue: q, result: { sent, left: 0, authLost: false, offline: false } };
}
export function newRoundId(rnd: () => number = Math.random): string {
  let s = "r" + Date.now().toString(36);
  for (let i = 0; i < 10; i++) s += Math.floor(rnd() * 36).toString(36);
  return s;
}
