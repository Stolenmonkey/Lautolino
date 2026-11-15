// Cloudflare-Worker-Einstieg. Bindings (wrangler.toml): DB (D1). Geheimnis: PEPPER (wrangler secret put PEPPER). Optional: ALLOWED_ORIGINS.
import { createApp } from "./app";
import { d1Db } from "./db";

export default {
  async fetch(req: Request, env: { DB: any; PEPPER: string; ALLOWED_ORIGINS?: string }): Promise<Response> {
    if (!env.PEPPER || env.PEPPER.length < 32) return new Response(JSON.stringify({ error: "PEPPER ist nicht gesetzt" }), { status: 500, headers: { "content-type": "application/json" } });
    const origins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!origins.length) return new Response(JSON.stringify({ error: "ALLOWED_ORIGINS ist nicht gesetzt" }), { status: 500, headers: { "content-type": "application/json" } });
    return createApp({ db: d1Db(env.DB), pepper: env.PEPPER, origins }).fetch(req);
  },
};
