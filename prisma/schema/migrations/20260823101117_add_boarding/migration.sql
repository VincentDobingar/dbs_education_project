-- CreateEnum
CREATE TYPE "DormitoryAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateTable
CREATE TABLE "DormitoryRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormitoryRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormitoryBed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DormitoryBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBedAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentBedAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormitoryAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "DormitoryAttendanceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormitoryAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DormitoryRoom_tenantId_idx" ON "DormitoryRoom"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DormitoryRoom_tenantId_name_key" ON "DormitoryRoom"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DormitoryBed_tenantId_idx" ON "DormitoryBed"("tenantId");

-- CreateIndex
CREATE INDEX "DormitoryBed_roomId_idx" ON "DormitoryBed"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "DormitoryBed_roomId_label_key" ON "DormitoryBed"("roomId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBedAssignment_studentId_key" ON "StudentBedAssignment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBedAssignment_bedId_key" ON "StudentBedAssignment"("bedId");

-- CreateIndex
CREATE INDEX "StudentBedAssignment_tenantId_idx" ON "StudentBedAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "DormitoryAttendance_tenantId_idx" ON "DormitoryAttendance"("tenantId");

-- CreateIndex
CREATE INDEX "DormitoryAttendance_assignmentId_idx" ON "DormitoryAttendance"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DormitoryAttendance_assignmentId_date_key" ON "DormitoryAttendance"("assignmentId", "date");

-- AddForeignKey
ALTER TABLE "DormitoryBed" ADD CONSTRAINT "DormitoryBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "DormitoryRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBedAssignment" ADD CONSTRAINT "StudentBedAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBedAssignment" ADD CONSTRAINT "StudentBedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "DormitoryBed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormitoryAttendance" ADD CONSTRAINT "DormitoryAttendance_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "StudentBedAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (§2), same pattern as every other tenant-scoped table since
-- 20260806170000_enable_row_level_security.
ALTER TABLE "DormitoryRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DormitoryRoom" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DormitoryRoom"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "DormitoryBed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DormitoryBed" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DormitoryBed"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentBedAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentBedAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentBedAssignment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "DormitoryAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DormitoryAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DormitoryAttendance"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
