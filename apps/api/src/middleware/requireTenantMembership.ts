import type { NextFunction, Request, Response } from "express";

import { getTenantRoleCodes } from "../lib/authorization.js";
import { prisma } from "../lib/prisma.js";
import { teacherScope } from "../lib/teacher-scope.js";

export function requireTenantMembership(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user || !req.tenant) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Auth and tenant resolution must run first" });
      return;
    }

    const membership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user.id, tenantId: req.tenant.id } },
    });

    if (!membership || membership.status !== "ACTIVE") {
      res.status(403).json({ code: "TENANT_MEMBERSHIP_REQUIRED", message: "Not a member of this tenant" });
      return;
    }

    const codes = await getTenantRoleCodes(req.user.id, req.tenant.id);
    if (
      codes.includes("TEACHER") &&
      !codes.some((c) =>
        [
          "SCHOOL_OWNER",
          "SCHOOL_ADMIN",
          "DIRECTOR",
          "ACADEMIC_DIRECTOR",
          "SECRETARY",
          "SUPERVISOR",
          "TENANT_AUDITOR",
        ].includes(c),
      )
    ) {
      if (req.originalUrl.includes("/registrations") || req.originalUrl.includes("/report-cards")) {
        res.status(403).json({ code: "ADMINISTRATION_REQUIRED", message: "Réservé à l'administration." });
        return;
      }
      const employee = await prisma.employee.findFirst({
        where: { userId: req.user.id, deletedAt: null, status: { not: "TERMINATED" } },
      });
      if (!employee && !["GET", "HEAD"].includes(req.method)) {
        res
          .status(403)
          .json({
            code: "EMPLOYEE_RECORD_REQUIRED",
            message: "Votre compte doit être lié à une fiche personnel active.",
          });
        return;
      }
      const assignments = employee
        ? await prisma.teacherAssignment.findMany({
            where: {
              employeeId: employee.id,
              academicYear: { isCurrent: true, deletedAt: null },
              classroom: { deletedAt: null },
            },
          })
        : [];
      const classroomIds = [...new Set(assignments.map((a) => a.classroomId))];
      const students = await prisma.enrollment.findMany({
        where: {
          classroomId: { in: classroomIds },
          academicYear: { isCurrent: true },
          deletedAt: null,
          status: { in: ["ENROLLED", "RE_ENROLLED"] },
          student: { deletedAt: null },
        },
      });
      teacherScope.run(
        {
          employeeId: employee?.id ?? "__no_employee__",
          classroomIds,
          subjectIds: [...new Set(assignments.map((a) => a.subjectId))],
          studentIds: [...new Set(students.map((s) => s.studentId))],
          pairs: assignments.map((a) => ({ classroomId: a.classroomId, subjectId: a.subjectId })),
        },
        next,
      );
      return;
    }
    next();
  })().catch(next);
}
