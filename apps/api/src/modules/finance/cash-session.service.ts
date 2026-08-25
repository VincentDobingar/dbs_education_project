import type { CashSession } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type {
  CloseCashSessionInput,
  ListCashSessionsQuery,
  OpenCashSessionInput,
} from "./cash-session.validation.js";

/** One OPEN session at a time per campus (or per tenant, for schools without campuses — campusId null is its own bucket). */
export async function openCashSession(
  input: OpenCashSessionInput,
  actingUserId: string,
): Promise<CashSession> {
  if (input.campusId) {
    const campus = await prisma.campus.findUnique({ where: { id: input.campusId } });
    if (!campus) {
      throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${input.campusId}`);
    }
  }

  const alreadyOpen = await prisma.cashSession.findFirst({
    where: { campusId: input.campusId ?? null, status: "OPEN" },
  });
  if (alreadyOpen) {
    throw new AppError(409, "CASH_SESSION_ALREADY_OPEN", "A cash session is already open for this campus");
  }

  const openedByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!openedByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can open a cash session",
    );
  }

  return prisma.cashSession.create({
    data: {
      tenantId: requireCurrentTenantId(),
      openedByEmployeeId,
      openingBalanceCents: input.openingBalanceCents,
      ...(input.campusId ? { campusId: input.campusId } : {}),
    },
  });
}

export async function requireCashSession(id: string): Promise<CashSession> {
  const session = await prisma.cashSession.findUnique({ where: { id } });
  if (!session) {
    throw new AppError(404, "CASH_SESSION_NOT_FOUND", `Cash session not found: ${id}`);
  }
  return session;
}

/**
 * Closing balance is entered by staff, not computed — StudentPayment/Expense carry no
 * cashSessionId to sum against (schema gap, same class of limitation as refunds having
 * no cash-side model). A discrepancy between expected and counted cash is a manual
 * reconciliation step outside this API for now, not an automatic check.
 */
export async function closeCashSession(
  id: string,
  input: CloseCashSessionInput,
  actingUserId: string,
): Promise<CashSession> {
  const session = await requireCashSession(id);
  if (session.status === "CLOSED") {
    throw new AppError(409, "CASH_SESSION_ALREADY_CLOSED", "This cash session is already closed");
  }

  const closedByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!closedByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can close a cash session",
    );
  }

  return prisma.cashSession.update({
    where: { id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedByEmployeeId,
      closingBalanceCents: input.closingBalanceCents,
    },
  });
}

export async function listCashSessions(query: ListCashSessionsQuery): Promise<CashSession[]> {
  return prisma.cashSession.findMany({
    where: {
      ...(query.campusId ? { campusId: query.campusId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { openedAt: "desc" },
  });
}
