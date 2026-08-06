import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://edumanage:edumanage@localhost:5432/edumanage_test",
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test-access-secret-please-change-please-change",
      JWT_REFRESH_SECRET: "test-refresh-secret-please-change-please-change",
    },
  },
});
