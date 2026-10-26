CREATE TABLE "SchoolGuardian" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL,
 "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "phone" TEXT NOT NULL,
 "email" TEXT, "address" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SchoolGuardian_id_tenantId_key" ON "SchoolGuardian"("id", "tenantId");
CREATE INDEX "SchoolGuardian_tenantId_idx" ON "SchoolGuardian"("tenantId");
CREATE UNIQUE INDEX "AcademicYear_id_tenantId_key" ON "AcademicYear"("id", "tenantId");
CREATE TABLE "RegistrationPeriod" (
 "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "academicYearId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL,
 "isOpen" BOOLEAN NOT NULL DEFAULT true, "installments" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "RegistrationPeriod_dates_check" CHECK ("endDate" >= "startDate"),
 CONSTRAINT "RegistrationPeriod_installments_check" CHECK (jsonb_typeof("installments") = 'array' AND jsonb_array_length("installments") BETWEEN 1 AND 3),
 CONSTRAINT "RegistrationPeriod_academicYearId_tenantId_fkey" FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RegistrationPeriod_id_tenantId_academicYearId_key" ON "RegistrationPeriod"("id", "tenantId", "academicYearId");
CREATE UNIQUE INDEX "RegistrationPeriod_tenantId_academicYearId_name_key" ON "RegistrationPeriod"("tenantId", "academicYearId", "name");
CREATE INDEX "RegistrationPeriod_tenantId_idx" ON "RegistrationPeriod"("tenantId");
ALTER TABLE "Student" ADD COLUMN "primaryGuardianId" TEXT;
ALTER TABLE "Student" ADD CONSTRAINT "Student_primaryGuardianId_tenantId_fkey" FOREIGN KEY ("primaryGuardianId", "tenantId") REFERENCES "SchoolGuardian"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD COLUMN "registrationPeriodId" TEXT;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_registrationPeriodId_tenantId_academicYearId_fkey" FOREIGN KEY ("registrationPeriodId", "tenantId", "academicYearId") REFERENCES "RegistrationPeriod"("id", "tenantId", "academicYearId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Les dossiers historiques sans tuteur/période restent identifiables comme incomplets.
-- Ne jamais inventer une responsabilité légale, un tarif ou une période passée.
ALTER TABLE "SchoolGuardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchoolGuardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SchoolGuardian" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "RegistrationPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistrationPeriod" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistrationPeriod" USING ("tenantId" = current_setting('app.tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
