-- Defense-in-depth (§2): Postgres Row-Level Security mirroring the tenant guard
-- Prisma extension (apps/api/src/lib/prisma.ts). A bug in the application layer
-- alone can no longer leak cross-tenant rows, because the database itself refuses
-- them unless "app.tenant_id" is set for the current transaction.
--
-- IMPORTANT: RLS is bypassed entirely for Postgres superusers and any role with
-- BYPASSRLS, regardless of FORCE ROW LEVEL SECURITY. The application MUST connect
-- as a plain role without that attribute (see docs/architecture.md) or none of
-- this has any effect.
ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicYear" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AcademicYear"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "AcademicPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicPeriod" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AcademicPeriod"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "EducationCycle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EducationCycle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EducationCycle"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "GradeLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GradeLevel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GradeLevel"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Program" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Program"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Department"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Classroom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Classroom" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Classroom"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subject" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subject"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SubjectCoefficient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubjectCoefficient" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubjectCoefficient"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TeacherAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TeacherAssignment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Timetable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Timetable" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Timetable"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TimetableEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimetableEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TimetableEntry"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Announcement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ParentStudentRelationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParentStudentRelationship" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ParentStudentRelationship"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ActivationInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivationInvitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActivationInvitation"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FeeCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeCategory"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FeeStructure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeStructure" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeStructure"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentInvoice"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentPayment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentReceipt"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ExpenseCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseCategory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExpenseCategory"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Expense"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashSession"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "AssessmentType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AssessmentType"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assessment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Assessment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Grade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Grade" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Grade"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ReportCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportCard" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReportCard"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Employee"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "EmploymentContract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmploymentContract" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmploymentContract"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "EmployeeAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmployeeAttendance"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TenantMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantMembership"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TenantDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantDomain" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantDomain"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TenantSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantSetting"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campus" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Campus"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Student" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Student"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Enrollment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentDocument"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attendance"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "DisciplinaryIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisciplinaryIncident" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DisciplinaryIncident"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

