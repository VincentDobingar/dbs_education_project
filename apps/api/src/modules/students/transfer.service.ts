import type { Student, StudentTransfer } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { rawPrisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { isTenantBlocked } from "../../lib/tenant-status.js";

import { requireStudentRecord } from "./student.service.js";
import type { CompleteStudentTransferInput, RequestStudentTransferInput } from "./transfer.validation.js";
import { TRANSFERABLE_STUDENT_FIELDS } from "./transfer.validation.js";

/**
 * StudentTransfer carries fromTenantId/toTenantId instead of a single tenantId, so
 * it is deliberately NOT in the tenant-guard's auto-scoped model list (see
 * tenant-scoped-models.ts) — every query here must filter by the caller's tenant
 * explicitly, via rawPrisma.
 *
 * A dedicated RLS policy (migration rls_child_tables_and_transfers) now backstops
 * this at the database level too: a row is visible only when app.tenant_id matches
 * fromTenantId OR toTenantId. Every query below therefore runs inside
 * withTenantSession(tenantId, ...) with the caller's own resolved tenant — never a
 * bare rawPrisma.studentTransfer call — or RLS would silently return nothing.
 */
function parseDataScope(value: unknown): (typeof TRANSFERABLE_STUDENT_FIELDS)[number][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is (typeof TRANSFERABLE_STUDENT_FIELDS)[number] =>
      typeof item === "string" && (TRANSFERABLE_STUDENT_FIELDS as readonly string[]).includes(item),
  );
}

async function resolveDestinationTenant(subdomain: string): Promise<{ id: string }> {
  const domain = await rawPrisma.tenantDomain.findUnique({
    where: { subdomain },
    include: { tenant: true },
  });
  if (!domain || !domain.verifiedAt || domain.tenant.deletedAt) {
    throw new AppError(
      404,
      "DESTINATION_TENANT_NOT_FOUND",
      `Unknown or unverified tenant subdomain: ${subdomain}`,
    );
  }
  if (isTenantBlocked(domain.tenant.status)) {
    throw new AppError(
      400,
      "DESTINATION_TENANT_UNAVAILABLE",
      "This destination tenant is no longer available",
    );
  }
  return { id: domain.tenant.id };
}

export async function requestTransfer(
  requestedByUserId: string,
  input: RequestStudentTransferInput,
): Promise<StudentTransfer> {
  const fromTenantId = requireCurrentTenantId();

  const student = await requireStudentRecord(input.studentId);
  if (student.status === "TRANSFERRED" || student.status === "ARCHIVED") {
    throw new AppError(400, "STUDENT_NOT_TRANSFERABLE", `Student is ${student.status.toLowerCase()}`);
  }

  const destination = await resolveDestinationTenant(input.toTenantSubdomain);
  if (destination.id === fromTenantId) {
    throw new AppError(400, "SAME_TENANT_TRANSFER", "Cannot transfer a student to the same tenant");
  }

  const pendingTransfer = await withTenantSession(fromTenantId, (tx) =>
    tx.studentTransfer.findFirst({
      where: { studentId: student.id, status: { in: ["REQUESTED", "APPROVED"] } },
    }),
  );
  if (pendingTransfer) {
    throw new AppError(409, "TRANSFER_ALREADY_PENDING", "This student already has a pending transfer");
  }

  return withTenantSession(fromTenantId, (tx) =>
    tx.studentTransfer.create({
      data: {
        studentId: student.id,
        fromTenantId,
        toTenantId: destination.id,
        requestedByUserId,
        status: "REQUESTED",
        dataScope: input.dataScope,
      },
    }),
  );
}

export async function listTransfers(direction: "incoming" | "outgoing"): Promise<StudentTransfer[]> {
  const tenantId = requireCurrentTenantId();
  return withTenantSession(tenantId, (tx) =>
    tx.studentTransfer.findMany({
      where: direction === "incoming" ? { toTenantId: tenantId } : { fromTenantId: tenantId },
      orderBy: { requestedAt: "desc" },
    }),
  );
}

/**
 * Fetches a transfer and verifies the caller's tenant is the expected party.
 * A mismatch (or an unknown id) surfaces as 404, never 403 — same convention the
 * tenant-guard extension uses for cross-tenant reads, so a transfer's existence is
 * never confirmed to a tenant that isn't one of its two parties. Runs under the
 * caller's own tenant context — RLS lets it see the row regardless of which of the
 * two parties it is, the party check below narrows it further.
 */
async function requireTransferForParty(id: string, party: "from" | "to"): Promise<StudentTransfer> {
  const tenantId = requireCurrentTenantId();
  const transfer = await withTenantSession(tenantId, (tx) =>
    tx.studentTransfer.findUnique({ where: { id } }),
  );
  const expectedTenantId = party === "from" ? transfer?.fromTenantId : transfer?.toTenantId;
  if (!transfer || expectedTenantId !== tenantId) {
    throw new AppError(404, "TRANSFER_NOT_FOUND", `Transfer not found: ${id}`);
  }
  return transfer;
}

export async function approveTransfer(id: string): Promise<StudentTransfer> {
  const transfer = await requireTransferForParty(id, "to");
  if (transfer.status !== "REQUESTED") {
    throw new AppError(409, "INVALID_TRANSFER_STATUS", `Transfer is ${transfer.status.toLowerCase()}`);
  }
  return withTenantSession(transfer.toTenantId as string, (tx) =>
    tx.studentTransfer.update({
      where: { id },
      data: { status: "APPROVED", decidedAt: new Date() },
    }),
  );
}

export async function rejectTransfer(id: string): Promise<StudentTransfer> {
  const transfer = await requireTransferForParty(id, "to");
  if (transfer.status !== "REQUESTED") {
    throw new AppError(409, "INVALID_TRANSFER_STATUS", `Transfer is ${transfer.status.toLowerCase()}`);
  }
  return withTenantSession(transfer.toTenantId as string, (tx) =>
    tx.studentTransfer.update({
      where: { id },
      data: { status: "REJECTED", decidedAt: new Date() },
    }),
  );
}

export interface CompleteTransferResult {
  transfer: StudentTransfer;
  newStudent: Omit<Student, "medicalNotes">;
}

/**
 * Executed by the SOURCE tenant once the destination has approved: creates the
 * destination's Student record (only the fields authorized in dataScope, plus the
 * bare firstName/lastName and a fresh destination-assigned matricule), then marks
 * the source record TRANSFERRED. The two writes run under two separate
 * withTenantSession calls — one per tenant's RLS context — so this is NOT atomic
 * across the tenant boundary; a failure between the two steps leaves the source
 * student not-yet-marked-TRANSFERRED, which is safe to retry (matricule reuse is
 * blocked, so a retried create would fail loudly rather than double-create).
 */
export async function completeTransfer(
  id: string,
  input: CompleteStudentTransferInput,
): Promise<CompleteTransferResult> {
  const transfer = await requireTransferForParty(id, "from");
  if (transfer.status !== "APPROVED") {
    throw new AppError(409, "INVALID_TRANSFER_STATUS", `Transfer is ${transfer.status.toLowerCase()}`);
  }
  if (!transfer.toTenantId) {
    throw new AppError(400, "TRANSFER_MISSING_DESTINATION", "Transfer has no destination tenant");
  }

  const sourceStudent = await requireStudentRecord(transfer.studentId);
  const allowedFields = parseDataScope(transfer.dataScope);

  const newStudent = await withTenantSession(transfer.toTenantId, async (tx) => {
    const matriculeTaken = await tx.student.findFirst({
      where: { tenantId: transfer.toTenantId as string, matricule: input.matricule },
    });
    if (matriculeTaken) {
      throw new AppError(409, "MATRICULE_TAKEN", `Matricule already in use: ${input.matricule}`);
    }

    return tx.student.create({
      data: {
        tenantId: transfer.toTenantId as string,
        matricule: input.matricule,
        firstName: sourceStudent.firstName,
        lastName: sourceStudent.lastName,
        status: "PROSPECTIVE",
        ...Object.fromEntries(allowedFields.map((field) => [field, sourceStudent[field]])),
      },
      omit: { medicalNotes: true },
    });
  });

  await withTenantSession(transfer.fromTenantId, async (tx) => {
    await tx.student.update({ where: { id: sourceStudent.id }, data: { status: "TRANSFERRED" } });
  });

  const updatedTransfer = await withTenantSession(transfer.fromTenantId, (tx) =>
    tx.studentTransfer.update({
      where: { id },
      data: { status: "COMPLETED" },
    }),
  );

  return { transfer: updatedTransfer, newStudent };
}
