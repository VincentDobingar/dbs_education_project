-- CreateEnum
CREATE TYPE "HomeworkSubmissionStatus" AS ENUM ('ON_TIME', 'LATE');

-- CreateTable
CREATE TABLE "Homework" (
    "id"                  TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "classroomId"         TEXT NOT NULL,
    "subjectId"           TEXT NOT NULL,
    "createdByEmployeeId" TEXT,
    "title"               TEXT NOT NULL,
    "instructions"        TEXT,
    "dueAt"               TIMESTAMP(3) NOT NULL,
    "deletedAt"           TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkSubmission" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "homeworkId"  TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "content"     TEXT,
    "fileUrl"     TEXT,
    "status"      "HomeworkSubmissionStatus" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Homework_tenantId_idx" ON "Homework"("tenantId");
CREATE INDEX "Homework_classroomId_idx" ON "Homework"("classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkSubmission_homeworkId_studentId_key" ON "HomeworkSubmission"("homeworkId", "studentId");
CREATE INDEX "HomeworkSubmission_tenantId_idx" ON "HomeworkSubmission"("tenantId");
CREATE INDEX "HomeworkSubmission_homeworkId_idx" ON "HomeworkSubmission"("homeworkId");
CREATE INDEX "HomeworkSubmission_studentId_idx" ON "HomeworkSubmission"("studentId");

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_homeworkId_fkey"
  FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (§2), same pattern as every other tenant-scoped table since
-- 20260806170000_enable_row_level_security.
ALTER TABLE "Homework" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Homework" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Homework"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "HomeworkSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HomeworkSubmission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HomeworkSubmission"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
