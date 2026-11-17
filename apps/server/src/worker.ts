// Cloudflare-Worker-Einstieg. Bindings (wrangler.toml): DB (D1). Geheimnisse: PEPPER, optional RESEND_API_KEY. Optional: ALLOWED_ORIGINS, APP_URL, MAIL_FROM.
import { createApp } from "./app";
import { d1Db } from "./db";
import { resendMailer } from "./mail";

export default {
  async fetch(req: Request, env: { DB: any; PEPPER: string; ALLOWED_ORIGINS?: string; APP_URL?: string; MAIL_FROM?: string; RESEND_API_KEY?: string }): Promise<Response> {
    if (!env.PEPPER || env.PEPPER.length < 32) return new Response(JSON.stringify({ error: "PEPPER ist nicht gesetzt" }), { status: 500, headers: { "content-type": "application/json" } });
    const origins = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!origins.length) return new Response(JSON.stringify({ error: "ALLOWED_ORIGINS ist nicht gesetzt" }), { status: 500, headers: { "content-type": "application/json" } });
    // E-Mail-Versand (optional): RESEND_API_KEY (Geheimnis), MAIL_FROM (Absender) und APP_URL (Adresse der Verwaltungsoberfläche, für die Links in den E-Mails)
    const mailer = env.RESEND_API_KEY && env.MAIL_FROM ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : undefined;
    return createApp({ db: d1Db(env.DB), pepper: env.PEPPER, origins, mailer, appUrl: env.APP_URL }).fetch(req);
  },
};
