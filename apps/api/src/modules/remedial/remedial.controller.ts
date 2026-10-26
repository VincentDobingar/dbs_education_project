import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { userHasPermission } from "../../lib/authorization.js";
import { resolveTenantActor } from "../../lib/tenant-actor.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { resolveActor } from "../platform-admin/platform-actor.js";

import * as adminService from "./remedial-admin.service.js";
import * as portalService from "./remedial-portal.service.js";
import * as schoolService from "./remedial-school.service.js";
import {
  catalogQuerySchema,
  enrollSchema,
  markPaidSchema,
  offerSchema,
  paySchema,
  reviewSchema,
  tariffSchema,
} from "./remedial.validation.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Même enveloppe async que les autres contrôleurs, en plus court. */
function handle(fn: Handler, status = 200) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const body = await fn(req, res);
      if (status === 204) res.status(204).send();
      else res.status(status).json(body);
    })().catch(next);
  };
}

const param = (req: Request, name: string): string => req.params[name] as string;
const userId = (req: Request): string => req.user!.id;
const canManage = (req: Request): Promise<boolean> =>
  userHasPermission(req.user!.id, requireCurrentTenantId(), "remedial.manage");

// --- Établissement
export const getContext = handle((req) => schoolService.getContext(userId(req)));
export const listTariffs = handle(() => schoolService.listTariffs());
export const createTariff = handle(
  async (req) => schoolService.createTariff(tariffSchema.parse(req.body), await resolveTenantActor(req)),
  201,
);
export const updateTariff = handle(async (req) =>
  schoolService.updateTariff(param(req, "id"), tariffSchema.parse(req.body), await resolveTenantActor(req)),
);
export const listOffers = handle(async (req) => {
  const { scope } = z.object({ scope: z.enum(["mine", "school"]).default("mine") }).parse(req.query);
  if (scope === "school" && !(await canManage(req))) return schoolService.listOffers("mine", userId(req));
  return schoolService.listOffers(scope, userId(req));
});
export const createOffer = handle(
  (req) => schoolService.createOffer(offerSchema.parse(req.body), userId(req)),
  201,
);
export const updateOffer = handle((req) =>
  schoolService.updateOffer(param(req, "id"), offerSchema.parse(req.body), userId(req)),
);
export const submitOffer = handle((req) => schoolService.submitOffer(param(req, "id"), userId(req)));
export const reviewOffer = handle(async (req) => {
  const input = reviewSchema.parse(req.body);
  return schoolService.reviewOffer(
    param(req, "id"),
    input.decision,
    input.note,
    await resolveTenantActor(req),
  );
});
export const closeOffer = handle(async (req) =>
  schoolService.closeOffer(param(req, "id"), userId(req), await canManage(req)),
);
export const listOfferEnrollments = handle(async (req) =>
  schoolService.listOfferEnrollments(param(req, "id"), userId(req), await canManage(req)),
);
export const recordCashPayment = handle(
  async (req) => schoolService.recordCashPayment(param(req, "id"), await resolveTenantActor(req)),
  201,
);
export const listSchoolPayouts = handle(async (req) =>
  schoolService.listPayouts(userId(req), await canManage(req)),
);

// --- Catalogue public
export const listCatalog = handle(async (req, res) => {
  res.set("Cache-Control", "public, max-age=120");
  return portalService.listCatalog(catalogQuerySchema.parse(req.query));
});

// --- Portail famille
export const listLearners = handle((req) => portalService.listLearners(userId(req)));
export const enroll = handle((req) => {
  const input = enrollSchema.parse(req.body);
  return portalService.enroll(userId(req), input.offerId, input.studentId);
}, 201);
export const listMyEnrollments = handle((req) => portalService.listMyEnrollments(userId(req)));
export const cancelEnrollment = handle((req) =>
  portalService.cancelEnrollment(userId(req), param(req, "id")),
);
export const listPaymentOptions = handle((req) =>
  portalService.listPaymentOptions(userId(req), param(req, "id")),
);
export const payOnline = handle((req) => {
  const input = paySchema.parse(req.body);
  return portalService.payOnline(userId(req), param(req, "id"), input.providerCode, input.phone);
}, 202);
export const getPaymentStatus = handle((req) =>
  portalService.getPaymentStatus(userId(req), param(req, "id"), param(req, "paymentIntentId")),
);

// --- Super-administration
export const listPlatformPayouts = handle((req) => {
  const { status } = z
    .object({ status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional() })
    .parse(req.query);
  return adminService.listPayouts(status);
});
export const markPayoutPaid = handle(async (req) => {
  const input = markPaidSchema.parse(req.body);
  return adminService.markPayoutPaid(
    param(req, "id"),
    input.reference,
    await resolveActor(req, input.justification),
  );
});
