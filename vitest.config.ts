import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/cliffords/tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});
