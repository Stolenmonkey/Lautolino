// Erzeugt das SQL für den ersten Admin-Zugang (Passwort bleibt bei dir, es wird nur der Hash ausgegeben).
//   ADMIN_EMAIL=du@beispiel.de ADMIN_PASSWORD='...' npm run admin-sql -w @silbenflug/server
// Danach das SQL ausführen:  npx wrangler d1 execute silbenflug-db --remote --command "<SQL>"
import { hashPassword } from "../src/crypto";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || "";
if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email) || pw.length < 12) { console.error("ADMIN_EMAIL (gültig) und ADMIN_PASSWORD (mindestens 12 Zeichen) setzen."); process.exit(1); }
const at = new Date().toISOString(), id = crypto.randomUUID();
console.log(`INSERT INTO staff_users(id,email,password_hash,role,school_id,active,created_at,updated_at) VALUES('${id}','${email}','${await hashPassword(pw)}','admin',NULL,1,'${at}','${at}');`);
