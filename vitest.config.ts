import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    fileParallelism: false,
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 80,
        lines: 85,
      },
    },
  },
});
