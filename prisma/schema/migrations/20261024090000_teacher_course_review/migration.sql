ALTER TABLE "Homework" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'HOMEWORK';
ALTER TABLE "OnlineCourse" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
 ADD COLUMN "reviewedByUserId" TEXT, ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewComment" TEXT;
ALTER TABLE "OnlineCourse" ADD CONSTRAINT "OnlineCourse_approvalStatus_check" CHECK ("approvalStatus" IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE "CourseResource" ADD COLUMN "fileKey" TEXT;
