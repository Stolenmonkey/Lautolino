import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const p = (x: string) => fileURLToPath(new URL(x, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@silbenflug/shared": p("./packages/shared/src/index.ts"),
      "@silbenflug/core": p("./packages/core/src/index.ts"),
      "@silbenflug/engine": p("./packages/engine/src/index.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
