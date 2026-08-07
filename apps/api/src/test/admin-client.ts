import { PrismaClient } from "@prisma/client";

import { TEST_DATABASE_ADMIN_URL } from "./test-database-url.js";

/** Trusted client for test fixture arrange/cleanup only — never import this outside src/test/. */
export const testAdminPrisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_ADMIN_URL });
