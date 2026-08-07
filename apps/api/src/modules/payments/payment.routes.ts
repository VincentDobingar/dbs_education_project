import { Router } from "express";

import * as paymentController from "./payment.controller.js";

/**
 * Mounted with a raw body parser (see app.ts) BEFORE the global JSON body parser
 * — signature verification needs the exact bytes the provider signed, not a
 * re-serialized JSON object. No auth middleware: the provider is the caller,
 * authenticated by its webhook signature instead (§24).
 */
export const paymentWebhookRouter: Router = Router();

paymentWebhookRouter.post("/:providerCode", paymentController.receiveWebhook);
