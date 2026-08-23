-- CreateEnum
CREATE TYPE "MealPlanType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MealEnrollmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MealAttendanceStatus" AS ENUM ('SERVED', 'ABSENT');

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MealPlanType" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentMealEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "MealEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentMealEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "MealAttendanceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Menu_tenantId_idx" ON "Menu"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_tenantId_date_key" ON "Menu"("tenantId", "date");

-- CreateIndex
CREATE INDEX "MealPlan_tenantId_idx" ON "MealPlan"("tenantId");

-- CreateIndex
CREATE INDEX "StudentMealEnrollment_tenantId_idx" ON "StudentMealEnrollment"("tenantId");

-- CreateIndex
CREATE INDEX "StudentMealEnrollment_studentId_idx" ON "StudentMealEnrollment"("studentId");

-- CreateIndex
CREATE INDEX "StudentMealEnrollment_mealPlanId_idx" ON "StudentMealEnrollment"("mealPlanId");

-- CreateIndex
CREATE INDEX "MealAttendance_tenantId_idx" ON "MealAttendance"("tenantId");

-- CreateIndex
CREATE INDEX "MealAttendance_enrollmentId_idx" ON "MealAttendance"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MealAttendance_enrollmentId_date_key" ON "MealAttendance"("enrollmentId", "date");

-- AddForeignKey
ALTER TABLE "StudentMealEnrollment" ADD CONSTRAINT "StudentMealEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMealEnrollment" ADD CONSTRAINT "StudentMealEnrollment_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealAttendance" ADD CONSTRAINT "MealAttendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentMealEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security (§2), same pattern as every other tenant-scoped table since
-- 20260806170000_enable_row_level_security.
ALTER TABLE "Menu" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Menu" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Menu"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "MealPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealPlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MealPlan"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentMealEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentMealEnrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentMealEnrollment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "MealAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MealAttendance"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
