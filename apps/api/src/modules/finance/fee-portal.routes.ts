import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePlatformRole } from "../../middleware/requirePlatformRole.js";
import { resolveActor } from "../platform-admin/platform-actor.js";

import {
  getFamilyPaymentStatus,
  getFamilySchedule,
  listFamilyPaymentOptions,
  payInvoiceOnline,
} from "./fee-schedule/family-payment.service.js";
import { listFeeSettlements, markFeeSettlementPaid } from "./fee-schedule/settlement.service.js";

function action(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch(next);
  };
}
const param = (req: Request, name: string): string => req.params[name] as string;

/** Handlers montés sous /parent-portal/children/:studentId/... (relation vérifiée en amont). */
export const familyFeeHandlers = {
  schedule: action(async (req, res) => {
    res.json(await getFamilySchedule(param(req, "studentId")));
  }),
  options: action(async (req, res) => {
    res.json(await listFamilyPaymentOptions(param(req, "studentId"), param(req, "invoiceId")));
  }),
  pay: action(async (req, res) => {
    const input = z
      .object({
        providerCode: z.string().min(1).max(40),
        phone: z
          .string()
          .trim()
          .regex(/^\+?[\d\s]{8,20}$/)
          .transform((value) => value.replace(/\s+/g, "")),
      })
      .parse(req.body);
    res
      .status(201)
      .json(
        await payInvoiceOnline(
          param(req, "studentId"),
          param(req, "invoiceId"),
          input.providerCode,
          input.phone,
        ),
      );
  }),
  status: action(async (req, res) => {
    res.json(
      await getFamilyPaymentStatus(param(req, "studentId"), param(req, "invoiceId"), param(req, "intentId")),
    );
  }),
};

/** SuperAdmin : reversements aux établissements des frais payés en ligne. */
export const feeSettlementPlatformRouter: Router = Router();
feeSettlementPlatformRouter.use(requireAuth);
feeSettlementPlatformRouter.get(
  "/",
  requirePlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN", "BILLING_MANAGER", "PLATFORM_AUDITOR"),
  action(async (_req, res) => {
    res.json(await listFeeSettlements());
  }),
);
feeSettlementPlatformRouter.post(
  "/:tenantId/mark-paid",
  requirePlatformRole("SUPER_ADMIN", "BILLING_MANAGER"),
  action(async (req, res) => {
    const input = z
      .object({
        reference: z.string().trim().min(1).max(120),
        justification: z.string().trim().min(1).max(500),
      })
      .parse(req.body);
    res.json(
      await markFeeSettlementPaid(
        param(req, "tenantId"),
        input.reference,
        await resolveActor(req, input.justification),
      ),
    );
  }),
);
