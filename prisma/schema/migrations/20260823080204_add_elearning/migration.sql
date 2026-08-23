-- CreateEnum
CREATE TYPE "LearningResourceType" AS ENUM ('VIDEO', 'DOCUMENT', 'LINK', 'TEXT');

-- CreateTable
CREATE TABLE "OnlineCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdByEmployeeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LearningResourceType" NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnlineCourse_tenantId_idx" ON "OnlineCourse"("tenantId");

-- CreateIndex
CREATE INDEX "OnlineCourse_classroomId_idx" ON "OnlineCourse"("classroomId");

-- CreateIndex
CREATE INDEX "CourseResource_tenantId_idx" ON "CourseResource"("tenantId");

-- CreateIndex
CREATE INDEX "CourseResource_courseId_idx" ON "CourseResource"("courseId");

-- CreateIndex
CREATE INDEX "ResourceProgress_tenantId_idx" ON "ResourceProgress"("tenantId");

-- CreateIndex
CREATE INDEX "ResourceProgress_resourceId_idx" ON "ResourceProgress"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceProgress_studentId_idx" ON "ResourceProgress"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceProgress_resourceId_studentId_key" ON "ResourceProgress"("resourceId", "studentId");

-- AddForeignKey
ALTER TABLE "OnlineCourse" ADD CONSTRAINT "OnlineCourse_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseResource" ADD CONSTRAINT "CourseResource_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "OnlineCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceProgress" ADD CONSTRAINT "ResourceProgress_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CourseResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceProgress" ADD CONSTRAINT "ResourceProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (§2), same pattern as every other tenant-scoped table since
-- 20260806170000_enable_row_level_security.
ALTER TABLE "OnlineCourse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnlineCourse" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OnlineCourse"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CourseResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseResource" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CourseResource"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ResourceProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceProgress" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ResourceProgress"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
