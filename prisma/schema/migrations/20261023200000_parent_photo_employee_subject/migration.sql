ALTER TABLE "Guardian" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "SchoolGuardian" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Employee" ADD COLUMN "email" TEXT, ADD COLUMN "subjectId" TEXT;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
