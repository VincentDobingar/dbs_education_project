import type { NextFunction, Request, Response } from "express";

import { rawPrisma, withTenantSession } from "../lib/prisma.js";
import { isStudentUnavailable } from "../lib/student-status.js";
import { runWithContext } from "../lib/tenant-context.js";
import { isTenantBlocked } from "../lib/tenant-status.js";

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

      // §26/§31 : un transfert/retrait/archivage change Student.status/deletedAt mais
      // ne révoque jamais ParentStudentRelationship — sans cette vérification l'accès
      // au portail parent survivait indéfiniment au départ de l'élève (lib/student-status.ts). Student
      // a la RLS forcée (contrairement à ParentStudentRelationship) : lecture via withTenantSession,
      // jamais rawPrisma nu (même piège documenté sur getCurrentUserProfile, auth.service.ts).
      const student = await withTenantSession(relationship.tenantId, (tx) =>
        tx.student.findUnique({ where: { id: studentId }, select: { status: true, deletedAt: true } }),
      );
      if (!student || isStudentUnavailable(student)) {
        res.status(403).json({ code: "STUDENT_UNAVAILABLE", message: "This student is no longer active" });
        return;
      }

      // Same shape enforceTenantScope sets — lets handlers written for staff routes
      // (e.g. PDF generation reading req.tenant.name) be reused unmodified here.
      const tenant = await rawPrisma.tenant.findUnique({ where: { id: relationship.tenantId } });
      if (tenant) {
        // §31 : un tenant suspendu/rejeté/annulé doit rester bloqué pour tout le
        // monde, pas seulement le personnel — enforceTenantScope l'impose déjà côté
        // staff, mais ce middleware est le seul point d'entrée côté portail parent
        // et ne repasse jamais par lui.
        if (isTenantBlocked(tenant.status)) {
          res.status(403).json({ code: "TENANT_UNAVAILABLE", message: "This tenant is no longer available" });
          return;
        }
        req.tenant = { id: tenant.id, name: tenant.name, status: tenant.status };
      }

      runWithContext({ tenantId: relationship.tenantId, userId: req.user.id }, () => {
        next();
      });
    })().catch(next);
  };
}
