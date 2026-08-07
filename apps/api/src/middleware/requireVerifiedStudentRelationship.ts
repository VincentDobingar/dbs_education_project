import type { NextFunction, Request, Response } from "express";

import { rawPrisma } from "../lib/prisma.js";
import { runWithContext } from "../lib/tenant-context.js";

type StudentIdResolver = (req: Request) => string | undefined;

const defaultStudentIdResolver: StudentIdResolver = (req) => {
  const value = req.params.studentId;
  return typeof value === "string" ? value : undefined;
};

/**
 * For parent-facing routes that target one specific child. A parent can have
 * verified children across different tenants (§9), so this middleware does NOT
 * assume enforceTenantScope already ran for the right tenant — it looks up the
 * relationship by (parentUserId, studentId) alone, then locks the tenant context
 * to THAT child's tenant for the rest of the request. Payment alone never grants
 * access here: only a VERIFIED, non-revoked ParentStudentRelationship does.
 */
export function requireVerifiedStudentRelationship(
  resolveStudentId: StudentIdResolver = defaultStudentIdResolver,
) {
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

      const relationship = await rawPrisma.parentStudentRelationship.findUnique({
        where: { parentUserId_studentId: { parentUserId: req.user.id, studentId } },
      });

      if (!relationship || relationship.status !== "VERIFIED" || relationship.revokedAt) {
        res.status(403).json({
          code: "STUDENT_RELATIONSHIP_NOT_VERIFIED",
          message: "No verified relationship with this student",
        });
        return;
      }

      runWithContext({ tenantId: relationship.tenantId, userId: req.user.id }, () => {
        next();
      });
    })().catch(next);
  };
}
