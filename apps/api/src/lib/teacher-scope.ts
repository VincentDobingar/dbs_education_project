import { AsyncLocalStorage } from "node:async_hooks";

import { AppError } from "./errors.js";

export interface TeacherScope {
  employeeId: string;
  classroomIds: string[];
  subjectIds: string[];
  studentIds: string[];
  pairs: { classroomId: string; subjectId: string }[];
}
export const teacherScope = new AsyncLocalStorage<TeacherScope>();
export function teacherFilter(model: string): Record<string, unknown> | null {
  const s = teacherScope.getStore();
  if (!s) return null;
  const pairs = { OR: s.pairs.length ? s.pairs : [{ id: "__no_assignment__" }] };
  switch (model) {
    case "AcademicYear":
      return { isCurrent: true, deletedAt: null };
    case "AcademicPeriod":
      return { academicYear: { isCurrent: true } };
    case "Student":
      return { id: { in: s.studentIds } };
    case "Classroom":
      return { id: { in: s.classroomIds } };
    case "Subject":
      return { id: { in: s.subjectIds } };
    case "TeacherAssignment":
      return { employeeId: s.employeeId, academicYear: { isCurrent: true } };
    case "Enrollment":
      return {
        studentId: { in: s.studentIds },
        classroomId: { in: s.classroomIds },
        academicYear: { isCurrent: true },
      };
    case "Homework":
    case "OnlineCourse":
      return pairs;
    case "Assessment":
      return { ...pairs, academicPeriod: { academicYear: { isCurrent: true } } };
    case "Attendance":
      return { classroomId: { in: s.classroomIds }, studentId: { in: s.studentIds } };
    case "DisciplinaryIncident":
      return { studentId: { in: s.studentIds } };
    case "Grade":
      return { studentId: { in: s.studentIds }, assessment: pairs };
    case "HomeworkSubmission":
      return { studentId: { in: s.studentIds }, homework: pairs };
    case "CourseResource":
      return { course: pairs };
    case "ResourceProgress":
      return { studentId: { in: s.studentIds }, resource: { course: pairs } };
    case "Timetable":
      return { academicYear: { isCurrent: true }, entries: { some: { teacherEmployeeId: s.employeeId } } };
    case "TimetableEntry":
      return { teacherEmployeeId: s.employeeId, timetable: { academicYear: { isCurrent: true } } };
    default:
      return null;
  }
}
export function checkTeacherWrite(model: string, value: unknown): void {
  const s = teacherScope.getStore();
  if (!s || !teacherFilter(model) || !value || typeof value !== "object") return;
  const d = value as Record<string, unknown>;
  if (
    (typeof d.studentId === "string" && !s.studentIds.includes(d.studentId)) ||
    (typeof d.classroomId === "string" && !s.classroomIds.includes(d.classroomId)) ||
    (typeof d.subjectId === "string" && !s.subjectIds.includes(d.subjectId)) ||
    (typeof d.classroomId === "string" &&
      typeof d.subjectId === "string" &&
      !s.pairs.some((p) => p.classroomId === d.classroomId && p.subjectId === d.subjectId))
  )
    throw new AppError(
      403,
      "TEACHER_SCOPE_REQUIRED",
      "Cette classe, matière ou cet élève ne vous est pas affecté.",
    );
}
