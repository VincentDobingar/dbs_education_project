import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";
import { teacherScope } from "./teacher-scope.js";

export async function requireTeacherRoster(classroomId: string, studentIds: string[]): Promise<void> {
  if (!teacherScope.getStore()) return;
  const enrollment = await prisma.enrollment.findMany({
    where: {
      classroomId,
      studentId: { in: studentIds },
      deletedAt: null,
      status: { in: ["ENROLLED", "RE_ENROLLED"] },
      academicYear: { isCurrent: true },
    },
  });
  const allowed = new Set(enrollment.map((e) => e.studentId));
  if (studentIds.some((id) => !allowed.has(id)))
    throw new AppError(400, "STUDENT_NOT_IN_CLASS", "Un élève ne fait pas partie de cette classe.");
}
