// Single source of truth for the test database connection, used by both
// vitest.config.ts (test.env) and global-setup.ts (whose process does not
// reliably inherit vitest's test.env — it needs its own explicit connection).
//
// The app itself always connects as edumanage_app (RLS-bound, same role
// production would use) — that is the thing under test. Fixture arrange/cleanup
// code is deliberately NOT part of what's under test, so it connects as the
// Postgres superuser instead, bypassing RLS the same way a migration or a trusted
// seed script would — see admin-client.ts.
export const TEST_DATABASE_URL =
  "postgresql://edumanage_app:6fXyjsU3ZHNo3qmEiA974dlI2xGJyemO@localhost:5432/edumanage_test";

export const TEST_DATABASE_ADMIN_URL = "postgresql://postgres:Postgres%402026@localhost:5432/edumanage_test";
