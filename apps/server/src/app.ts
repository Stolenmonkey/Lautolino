import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { Deps, Env } from "./context";
import { authenticate } from "./middleware";
import { adminRoutes } from "./routes/admin";
import { evaluationRoutes } from "./routes/evaluation";
import { authRoutes } from "./routes/auth";
import { parentRoutes } from "./routes/parent";
import { planRoutes } from "./routes/plan";
import { progressRoutes } from "./routes/progress";
import { schoolRoutes } from "./routes/school";
import { studentRoutes } from "./routes/student";
import { activeConfig } from "./util";

export function createApp(deps: Deps) {
  const app = new Hono<Env>();
  app.use("*", cors({ origin: deps.origins && deps.origins.length ? deps.origins : "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
  app.use("*", async (c, next) => { c.set("deps", deps); await next(); });
  // Schutz-Kopfzeilen: Antworten der Schnittstelle werden nie zwischengespeichert, nicht als anderer Typ gedeutet und nicht eingebettet.
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store"); c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer"); c.header("X-Frame-Options", "DENY");
  });
  // Anfragen über 1 MB werden abgelehnt (die größten echten Anfragen sind Runden und Konfigurationen, weit darunter).
  app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "Anfrage zu groß" }, 413) }));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Serverfehler" }, 500);
  });
  app.notFound((c) => c.json({ error: "nicht gefunden" }, 404));

  app.get("/health", (c) => c.json({ ok: true }));
  // Aktive Konfiguration für angemeldete Geräte (Kinder sehen keine Sicherheits- und Löschwerte).
  app.get("/config", authenticate, async (c) => {
    const p = c.get("p"), { version, config } = await activeConfig(deps);
    if (p.kind === "staff" && p.role === "admin") return c.json({ version, config });
    const { security, retention, ...rest } = config;
    return c.json({ version, config: rest });
  });
  app.route("/auth", authRoutes());
  app.route("/student", studentRoutes());
  app.route("/admin", adminRoutes());
  app.route("/", schoolRoutes());
  app.route("/", planRoutes());
  app.route("/", progressRoutes());
  app.route("/", evaluationRoutes());
  app.route("/", parentRoutes());
  return app;
}
