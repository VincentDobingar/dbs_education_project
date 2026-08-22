import type { ParentStudentRelationship, StudentStatus } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma, rawPrisma, withTenantSession } from "../../lib/prisma.js";
import type { TenantActor } from "../../lib/tenant-actor.js";

import type { ListRelationshipsQuery } from "./parent-student-relationship.validation.js";

export async function listRelationships(query: ListRelationshipsQuery): Promise<ParentStudentRelationship[]> {
  return prisma.parentStudentRelationship.findMany({
    where: { ...(query.studentId ? { studentId: query.studentId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

async function requireRelationship(id: string): Promise<ParentStudentRelationship> {
  const relationship = await prisma.parentStudentRelationship.findUnique({ where: { id } });
  if (!relationship) {
    throw new AppError(404, "RELATIONSHIP_NOT_FOUND", `Parent-student relationship not found: ${id}`);
  }
  return relationship;
}

/**
 * §9 : révocation d'un lien incorrect, motif obligatoire (revokedReason). Finalisation
 * Phase 2 : action tenant-interne sensible, auditée — `reason` alimente aussi
 * `justification` sur l'entrée d'audit, il n'y a qu'un seul motif à porter.
 */
export async function revokeRelationship(
  id: string,
  reason: string,
  actor: TenantActor,
): Promise<ParentStudentRelationship> {
  const relationship = await requireRelationship(id);
  if (relationship.status === "REVOKED" || relationship.revokedAt) {
    throw new AppError(409, "RELATIONSHIP_ALREADY_REVOKED", "This relationship is already revoked");
  }

  const revoked = await prisma.parentStudentRelationship.update({
    where: { id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedById: actor.actorUserId,
      revokedReason: reason,
    },
  });

  await recordAuditLog({
    tenantId: revoked.tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "parent_student_relationship.revoke",
    entityType: "ParentStudentRelationship",
    entityId: revoked.id,
    beforeData: { status: relationship.status },
    afterData: { status: revoked.status, revokedReason: reason },
    justification: reason,
  });

  return revoked;
}

export interface VerifiedChild {
  relationship: ParentStudentRelationship;
  student: {
    id: string;
    tenantId: string;
    matricule: string;
    firstName: string;
    lastName: string;
    status: StudentStatus;
  };
}

/**
 * Cross-tenant by design (§9) : un parent peut avoir des enfants dans des
 * établissements différents, donc il n'existe pas de contexte tenant unique à
 * verrouiller pour toute la liste. `ParentStudentRelationship` n'a plus de RLS (même
 * précédent que TenantDomain), mais `Student` en garde — chaque lecture d'élève
 * passe donc par `withTenantSession`, verrouillé sur le tenant de SA relation, pas
 * de dérogation RLS sur `Student` lui-même (données sensibles).
 */
export async function listVerifiedChildrenForParent(parentUserId: string): Promise<VerifiedChild[]> {
  const relationships = await rawPrisma.parentStudentRelationship.findMany({
    where: { parentUserId, status: "VERIFIED", revokedAt: null },
    orderBy: { verifiedAt: "desc" },
  });

  const children = await Promise.all(
    relationships.map(async (relationship) => {
      const student = await withTenantSession(relationship.tenantId, (tx) =>
        tx.student.findUnique({
          where: { id: relationship.studentId },
          select: {
            id: true,
            tenantId: true,
            matricule: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        }),
      );
      return student ? { relationship, student } : null;
    }),
  );

  return children.filter((child): child is VerifiedChild => child !== null);
}
