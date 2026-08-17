-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('AVAILABLE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LibraryLoanStatus" AS ENUM ('ACTIVE', 'RETURNED', 'LOST');

-- CreateTable
CREATE TABLE "Book" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "isbn"        TEXT,
    "title"       TEXT NOT NULL,
    "author"      TEXT NOT NULL,
    "category"    TEXT,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "status"      "BookStatus" NOT NULL DEFAULT 'AVAILABLE',
    "deletedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryLoan" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "bookId"             TEXT NOT NULL,
    "studentId"          TEXT NOT NULL,
    "issuedByEmployeeId" TEXT,
    "borrowedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt"              TIMESTAMP(3) NOT NULL,
    "returnedAt"         TIMESTAMP(3),
    "status"             "LibraryLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Book_tenantId_idx" ON "Book"("tenantId");

-- CreateIndex
CREATE INDEX "LibraryLoan_tenantId_idx" ON "LibraryLoan"("tenantId");
CREATE INDEX "LibraryLoan_bookId_idx" ON "LibraryLoan"("bookId");
CREATE INDEX "LibraryLoan_studentId_idx" ON "LibraryLoan"("studentId");

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (§2), same pattern as every other tenant-scoped table since
-- 20260806170000_enable_row_level_security.
ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Book" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Book"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "LibraryLoan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LibraryLoan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LibraryLoan"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
