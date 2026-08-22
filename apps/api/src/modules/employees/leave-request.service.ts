import type { LeaveRequest } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { getEmployee } from "./employee.service.js";
import type { CreateLeaveRequestInput, DecideLeaveRequestInput } from "./leave-request.validation.js";

/** Never trust a client-supplied employee id for "who decided this request". */
async function resolveActingEmployeeId(userId: string): Promise<string | undefined> {
  const employee = await prisma.employee.findFirst({ where: { userId } });
  return employee?.id;
}

export async function createLeaveRequest(
  employeeId: string,
  input: CreateLeaveRequestInput,
): Promise<LeaveRequest> {
  await getEmployee(employeeId);

  return prisma.leaveRequest.create({
    data: {
      tenantId: requireCurrentTenantId(),
      employeeId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  });
}

export async function listLeaveRequests(employeeId: string): Promise<LeaveRequest[]> {
  await getEmployee(employeeId);
  return prisma.leaveRequest.findMany({ where: { employeeId }, orderBy: { startDate: "desc" } });
}

async function requireLeaveRequest(employeeId: string, id: string): Promise<LeaveRequest> {
  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest || leaveRequest.employeeId !== employeeId) {
    throw new AppError(404, "LEAVE_REQUEST_NOT_FOUND", `Leave request not found: ${id}`);
  }
  return leaveRequest;
}

/** PENDING est le seul statut décidable — une décision déjà prise (ou une annulation
 * déjà faite) reste définitive, jamais réécrite. */
export async function decideLeaveRequest(
  employeeId: string,
  id: string,
  input: DecideLeaveRequestInput,
  actingUserId: string,
): Promise<LeaveRequest> {
  const leaveRequest = await requireLeaveRequest(employeeId, id);
  if (leaveRequest.status !== "PENDING") {
    throw new AppError(409, "LEAVE_REQUEST_ALREADY_DECIDED", `Leave request already ${leaveRequest.status}`);
  }

  const approvedByEmployeeId = await resolveActingEmployeeId(actingUserId);

  return prisma.leaveRequest.update({
    where: { id },
    data: { status: input.status, ...(approvedByEmployeeId ? { approvedByEmployeeId } : {}) },
  });
}
