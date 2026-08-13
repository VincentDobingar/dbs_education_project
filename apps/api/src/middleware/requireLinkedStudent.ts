import type { NextFunction, Request, Response } from "express";

import { rawPrisma } from "../lib/prisma.js";
import { runWithContext } from "../lib/tenant-context.js";

type StudentIdResolver = (req: Request) => string | undefined;

const defaultStudentIdResolver: StudentIdResolver = (req) => {
  const value = req.params.studentId;
  return typeof value === "string" ? value : undefined;
};

/**
 * For student-facing routes (§26): a Student record only becomes accessible to a
 * User through StudentUserLink, created exclusively by the activation-code
 * redemption flow (§8) — never from mere authentication. No separate VERIFIED
 * status here (unlike ParentStudentRelationship): the link's existence already is
 * the verification, guaranteed at creation time. Same tenant-locking shape as
 * requireVerifiedStudentRelationship — StudentUserLink carries tenantId for the
 * same bootstrap reason.
 */
export function requireLinkedStudent(resolveStudentId: StudentIdResolver = defaultStudentIdResolver) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      if (!req.user) {
        res.status(401).json({ code: "UNAUTHENTICATED", message: "requireAuth must run first" });
        return;
      }

      const studentId = resolveStudentId(req);

      if (!studentId) {
        res.status(400).json({ code: "STUDENT_ID_REQUIRED", message: "No student id in this request" });
        return;
      }

      const link = await rawPrisma.studentUserLink.findUnique({ where: { studentId } });

      if (!link || link.userId !== req.user.id) {
        res.status(403).json({
          code: "STUDENT_LINK_NOT_VERIFIED",
          message: "This account is not linked to this student",
        });
        return;
      }

      const tenant = await rawPrisma.tenant.findUnique({ where: { id: link.tenantId } });
      if (tenant) {
        req.tenant = { id: tenant.id, name: tenant.name, status: tenant.status };
      }

      runWithContext({ tenantId: link.tenantId, userId: req.user.id }, () => {
        next();
      });
    })().catch(next);
  };
}
