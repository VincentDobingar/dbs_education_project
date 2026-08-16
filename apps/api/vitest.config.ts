import { defineConfig } from "vitest/config";

import { TEST_DATABASE_URL } from "./src/test/test-database-url.js";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test-access-secret-please-change-please-change",
      JWT_REFRESH_SECRET: "test-refresh-secret-please-change-please-change",
      MFA_ENCRYPTION_KEY: "4a9c6f4c773330c2e844b085fe7fcc74178960db3e944c0abaa020a41d810b04",
    },
  },
});
