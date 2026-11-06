// Lokaler Entwicklungsserver mit SQLite-Datei:  npm run dev -w @silbenflug/server   (Port 8787)
import { createRequire } from "node:module";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app";
import { nodeSqliteDb } from "../src/db";
import { migrateLocal } from "../src/migrate";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const raw = new DatabaseSync(process.env.DB_FILE || "silbenflug-dev.sqlite");
raw.exec("PRAGMA foreign_keys=ON");
console.log("Migrationen:", migrateLocal(raw, new URL("../../../db/migrations", import.meta.url).pathname).join(", ") || "keine neuen");
const pepper = process.env.PEPPER || "nur-fuer-lokale-entwicklung-nicht-produktiv-0123456789";
serve({ fetch: createApp({ db: nodeSqliteDb(raw), pepper }).fetch, port: Number(process.env.PORT || 8787) }, (i) => console.log(`Silbenflug-Server läuft auf http://localhost:${i.port}`));
