import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { resolveTenantActor } from "../../lib/tenant-actor.js";

import { generateAllocationReceiptPdf } from "./allocation-receipt-pdf.service.js";
import {
  rescheduleInvoice,
  rescheduleSchema,
  splitInvoice,
  splitSchema,
  getStudentSchedule,
} from "./fee-schedule/fee-exceptions.service.js";
import {
  getAllocationGroup,
  listStudentCredits,
  recordStudentPayment,
} from "./fee-schedule/payment-allocation.service.js";
import { getRecoveryDashboard } from "./fee-schedule/recovery.service.js";
import * as setup from "./fee-setup.service.js";
import {
  copyFeeSetupSchema,
  discountPresetSchema,
  feePlanSchema,
  feePolicySchema,
  updateDiscountPresetSchema,
} from "./fee-setup.validation.js";

function action(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch(next);
  };
}

export const getPolicy = action(async (req, res) => {
  res.json(await setup.getFeePolicy(req.tenant!.id));
});
export const putPolicy = action(async (req, res) => {
  res.json(await setup.updateFeePolicy(feePolicySchema.parse(req.body), req.user!.id));
});

export const listPlans = action(async (req, res) => {
  const query = z.object({ academicYearId: z.string().min(1).optional() }).parse(req.query);
  res.json(await setup.listFeePlans(query.academicYearId));
});
export const createPlan = action(async (req, res) => {
  res.status(201).json(await setup.createFeePlan(feePlanSchema.parse(req.body)));
});
export const updatePlan = action(async (req, res) => {
  res.json(await setup.updateFeePlan(req.params.id as string, feePlanSchema.parse(req.body)));
});
export const deletePlan = action(async (req, res) => {
  await setup.deleteFeePlan(req.params.id as string);
  res.status(204).end();
});
export const copySetup = action(async (req, res) => {
  res.status(201).json(await setup.copyFeeSetup(copyFeeSetupSchema.parse(req.body)));
});

export const listDiscounts = action(async (_req, res) => {
  res.json(await setup.listDiscountPresets());
});
export const createDiscount = action(async (req, res) => {
  res.status(201).json(await setup.createDiscountPreset(discountPresetSchema.parse(req.body)));
});
export const updateDiscount = action(async (req, res) => {
  res.json(
    await setup.updateDiscountPreset(req.params.id as string, updateDiscountPresetSchema.parse(req.body)),
  );
});

export const studentSchedule = action(async (req, res) => {
  res.json(await getStudentSchedule(req.params.studentId as string));
});
export const studentCredits = action(async (req, res) => {
  res.json(await listStudentCredits(req.params.studentId as string));
});
export const recordPayment = action(async (req, res) => {
  const input = z
    .object({
      amountCents: z.number().int().positive().max(2_000_000_000),
      invoiceId: z.string().min(1).optional(),
    })
    .parse(req.body);
  res.status(201).json(await recordStudentPayment(req.params.studentId as string, input, req.user!.id));
});
export const paymentGroup = action(async (req, res) => {
  res.json(await getAllocationGroup(req.params.groupId as string));
});
export const paymentGroupPdf = action(async (req, res) => {
  if (!req.tenant)
    throw new AppError(400, "TENANT_REQUIRED", "This route must be called on a tenant subdomain");
  const groupId = req.params.groupId as string;
  const pdf = await generateAllocationReceiptPdf(groupId, req.tenant);
  res
    .status(200)
    .set("Content-Type", "application/pdf")
    .set("Content-Disposition", `inline; filename="recu-versement-${groupId.slice(0, 8)}.pdf"`)
    .send(pdf);
});

export const reschedule = action(async (req, res) => {
  const actor = await resolveTenantActor(req);
  res.json(await rescheduleInvoice(req.params.id as string, rescheduleSchema.parse(req.body), actor));
});
export const split = action(async (req, res) => {
  const actor = await resolveTenantActor(req);
  res.status(201).json(await splitInvoice(req.params.id as string, splitSchema.parse(req.body), actor));
});

export const recovery = action(async (req, res) => {
  const query = z.object({ academicYearId: z.string().min(1) }).parse(req.query);
  res.json(await getRecoveryDashboard(query.academicYearId));
});
