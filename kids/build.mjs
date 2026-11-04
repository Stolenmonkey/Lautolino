// Bündelt die Kinder-App (TypeScript, core und engine unverändert) zu einer Datei: apps/kids/dist/app.js
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
await build({ entryPoints: [here + "src/main.ts"], outfile: here + "dist/app.js", bundle: true, format: "iife", target: "es2020", minify: true, tsconfig: here + "../../tsconfig.json", logLevel: "info" });
