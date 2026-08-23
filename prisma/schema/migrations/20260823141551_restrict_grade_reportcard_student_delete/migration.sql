-- DropForeignKey
ALTER TABLE "Grade" DROP CONSTRAINT "Grade_studentId_fkey";

-- DropForeignKey
ALTER TABLE "ReportCard" DROP CONSTRAINT "ReportCard_studentId_fkey";

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
