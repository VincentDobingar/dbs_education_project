import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as paymentService from "./payment.service.js";

export function receiveWebhook(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const providerCode = req.params.providerCode;

    if (typeof providerCode !== "string" || providerCode.length === 0) {
      throw new AppError(400, "PROVIDER_CODE_REQUIRED", "Missing provider code in webhook URL");
    }

    if (!Buffer.isBuffer(req.body)) {
      throw new AppError(
        400,
        "RAW_BODY_REQUIRED",
        "Webhook body must be read raw for signature verification",
      );
    }

    const rawBody = req.body.toString("utf8");
    await paymentService.processWebhookEvent(providerCode, rawBody, req.headers);

    res.status(200).json({ received: true });
  })().catch(next);
}
