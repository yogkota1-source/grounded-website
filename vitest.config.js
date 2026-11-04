import { defineConfig } from "vitest/config";
import path from "node:path";

const mock = (name) => path.resolve(__dirname, "tests/mocks", name);

export default defineConfig({
  resolve: {
    alias: {
      // Firebase is loaded from a CDN in the browser; tests use local mocks instead.
      "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js": mock("firebase-app.js"),
      "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js": mock("firebase-auth.js")
    }
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    restoreMocks: false,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      all: true,
      include: ["*.js"],
      exclude: ["vitest.config.js", "tests/**", "node_modules/**", "coverage/**"],
      reporter: ["text", "html"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  }
});

