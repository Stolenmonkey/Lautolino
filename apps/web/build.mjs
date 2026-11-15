// Bündelt das PDF-Modul (Silben-Zug) mit den Buchstabenformen aus core zu apps/web/js/zug.bundle.js. Die übrige Oberfläche bleibt ohne Build.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
await build({ entryPoints: [here + "src/zug.ts"], outfile: here + "js/zug.bundle.js", bundle: true, format: "esm", target: "es2020", minify: true, tsconfig: here + "../../tsconfig.json", logLevel: "info" });
