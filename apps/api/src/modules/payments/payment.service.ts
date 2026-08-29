import {
  Prisma,
  type BillingPeriod,
  type Invoice,
  type PaymentIntent,
  type PaymentTransaction,
} from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, type PrismaTransactionClient } from "../../lib/prisma.js";
import { isTransitionAllowed } from "../subscriptions/subscription-transitions.js";
import { applySubscriptionTransition } from "../subscriptions/subscription.service.js";

import { getPaymentProviderAdapter } from "./payment-providers/registry.js";
import type { NormalizedWebhookEvent } from "./payment-providers/types.js";
import { generateReference } from "./reference.js";

type Tx = PrismaTransactionClient;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function resolvePlanPrice(
  tx: Tx,
  planId: string,
  currencyId: string,
  billingPeriod: BillingPeriod,
  countryId: string | null,
) {
  if (countryId) {
    const specific = await tx.planPrice.findFirst({
      where: { planId, currencyId, billingPeriod, countryId, isActive: true },
    });
    if (specific) return specific;
  }

  const generic = await tx.planPrice.findFirst({
    where: { planId, currencyId, billingPeriod, countryId: null, isActive: true },
  });

  if (!generic) {
    throw new AppError(
      404,
      "PLAN_PRICE_NOT_FOUND",
      "No price configured for this plan/currency/billing period",
    );
  }

  return generic;
}

/**
 * §31 tranche 8 avait branché la consommation reelle d'un PromotionCode (la
 * PromotionRedemption est creee/comptee) mais jamais son application au montant
 * facture -- createInvoiceForSubscription facturait toujours le plein tarif du
 * plan. PromotionCode n'a pas de currencyId : discountValue (Decimal) est traite
 * comme un montant dans la devise de LA FACTURE en cours (jamais une conversion
 * inter-devises inventee, §40) -- PERCENTAGE s'applique tel quel au sous-total,
 * FIXED_AMOUNT est mis a l'echelle via Currency.decimalDigits (ex: 500.00 avec
 * decimalDigits=2 -> 50000 centimes ; XAF, decimalDigits=0 -> 500). Plafonne au
 * sous-total : une remise ne peut jamais rendre la facture negative.
 */
async function resolveDiscountCents(
  tx: Tx,
  subscriptionId: string,
  subtotalCents: number,
  currencyDecimalDigits: number,
): Promise<number> {
  const redemption = await tx.promotionRedemption.findFirst({
    where: { subscriptionId },
    include: { promotionCode: true },
    orderBy: { redeemedAt: "desc" },
  });
  if (!redemption) {
    return 0;
  }

  const { discountType, discountValue } = redemption.promotionCode;
  const rawDiscountCents =
    discountType === "PERCENTAGE"
      ? Math.round((subtotalCents * Number(discountValue)) / 100)
      : Math.round(Number(discountValue) * 10 ** currencyDecimalDigits);

  return Math.min(Math.max(rawDiscountCents, 0), subtotalCents);
}

export interface CreateInvoiceForSubscriptionInput {
  subscriptionId: string;
  currencyIsoCode: string;
  countryIsoCode?: string;
  billingName: string;
  billingEmail: string;
}

/** Creates (or reuses) the owner's BillingAccount, then a DRAFT Invoice priced from PlanPrice. */
export async function createInvoiceForSubscription(
  input: CreateInvoiceForSubscriptionInput,
): Promise<Invoice> {
  const subscription = await prisma.subscription.findUniqueOrThrow({ where: { id: input.subscriptionId } });
  const currency = await prisma.currency.findUniqueOrThrow({ where: { isoCode: input.currencyIsoCode } });
  const country = input.countryIsoCode
    ? await prisma.country.findUnique({ where: { isoCode: input.countryIsoCode } })
    : null;

  return prisma.$transaction(async (tx) => {
    const price = await resolvePlanPrice(
      tx,
      subscription.planId,
      currency.id,
      subscription.billingPeriod,
      country?.id ?? null,
    );

    let billingAccount = await tx.billingAccount.findFirst({ where: { ownerId: subscription.ownerId } });
    billingAccount ??= await tx.billingAccount.create({
      data: {
        ownerId: subscription.ownerId,
        billingName: input.billingName,
        billingEmail: input.billingEmail,
        currencyId: currency.id,
      },
    });

    const discountCents = await resolveDiscountCents(
      tx,
      subscription.id,
      price.amountCents,
      currency.decimalDigits,
    );
    // §31/§40 : la remise s'applique avant la taxe -- la taxe est due sur ce que le
    // client paie reellement, jamais sur le plein tarif affiche.
    const taxableCents = price.amountCents - discountCents;
    const taxCents = Math.round((taxableCents * Number(price.taxRatePercent)) / 100);

    const invoice = await tx.invoice.create({
      data: {
        billingAccountId: billingAccount.id,
        subscriptionId: subscription.id,
        number: generateReference("INV"),
        status: "ISSUED",
        currencyId: currency.id,
        subtotalCents: price.amountCents,
        discountCents,
        taxCents,
        totalCents: taxableCents + taxCents,
        issuedAt: new Date(),
      },
    });

    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Abonnement — ${subscription.billingPeriod}`,
        unitAmountCents: price.amountCents,
        totalAmountCents: price.amountCents,
      },
    });

    if (discountCents > 0) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: "Remise — code promotionnel",
          unitAmountCents: -discountCents,
          totalAmountCents: -discountCents,
        },
      });
    }

    return invoice;
  });
}

/** Never trust an invoiceId/paymentIntentId from a client without checking it
 * actually belongs to the subscription the caller is authorized for (§2, §40) —
 * otherwise a tenant admin could pay or reference another tenant's invoice
 * simply by guessing its id. */
export async function assertInvoiceBelongsToSubscription(
  invoiceId: string,
  subscriptionId: string,
): Promise<Invoice> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });

  if (!invoice || invoice.subscriptionId !== subscriptionId) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found for this subscription");
  }

  return invoice;
}

export async function assertPaymentIntentBelongsToSubscription(
  paymentIntentId: string,
  subscriptionId: string,
): Promise<PaymentIntent> {
  const intent = await prisma.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: { invoice: true },
  });

  if (!intent || intent.invoice?.subscriptionId !== subscriptionId) {
    throw new AppError(404, "PAYMENT_INTENT_NOT_FOUND", "Payment intent not found for this subscription");
  }

  return intent;
}

export interface CreatePaymentIntentInput {
  invoiceId: string;
  providerCode: string;
  idempotencyKey?: string;
}

/** Idempotent by idempotencyKey: calling this twice with the same key returns the same intent. */
export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
  const idempotencyKey = input.idempotencyKey ?? generateReference("PI");

  const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return existing;
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
  const provider = await prisma.paymentProvider.findUnique({ where: { code: input.providerCode } });

  if (!provider || !provider.isActive) {
    throw new AppError(
      404,
      "PAYMENT_PROVIDER_NOT_FOUND",
      `Unknown or inactive provider: ${input.providerCode}`,
    );
  }

  return prisma.paymentIntent.create({
    data: {
      providerId: provider.id,
      purpose: "SAAS_INVOICE",
      invoiceId: invoice.id,
      amountCents: invoice.totalCents,
      currencyId: invoice.currencyId,
      idempotencyKey,
    },
  });
}

/**
 * Shared by both the synchronous cash flow and the webhook flow: marks the
 * invoice paid, activates the subscription if applicable, and issues a receipt.
 * Idempotent — safe to call again for a transaction that already went through
 * (the ACTIVE transition and the receipt creation are both no-ops the second time).
 */
async function handleSuccessfulTransaction(tx: Tx, transaction: PaymentTransaction): Promise<void> {
  const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: transaction.paymentIntentId } });

  if (intent.invoiceId) {
    const invoice = await tx.invoice.update({
      where: { id: intent.invoiceId },
      data: { status: "PAID", paidAt: new Date() },
    });

    if (invoice.subscriptionId) {
      const subscription = await tx.subscription.findUniqueOrThrow({ where: { id: invoice.subscriptionId } });
      if (isTransitionAllowed(subscription.status, "ACTIVE")) {
        await applySubscriptionTransition(tx, subscription.id, "ACTIVE", { reason: "Payment received" });
      }
    }
  }

  const existingReceipt = await tx.receipt.findUnique({ where: { paymentTransactionId: transaction.id } });
  if (!existingReceipt) {
    await tx.receipt.create({
      data: {
        paymentTransactionId: transaction.id,
        ...(intent.invoiceId ? { invoiceId: intent.invoiceId } : {}),
        number: generateReference("REC"),
      },
    });
  }
}

export interface RecordManualCashPaymentInput {
  paymentIntentId: string;
}

/** Agent-recorded cash payment (§24) — synchronous, no webhook involved. */
export async function recordManualCashPayment(
  input: RecordManualCashPaymentInput,
): Promise<PaymentTransaction> {
  const intent = await prisma.paymentIntent.findUniqueOrThrow({
    where: { id: input.paymentIntentId },
    include: { provider: true },
  });

  if (intent.provider.methodType !== "CASH") {
    throw new AppError(422, "NOT_A_CASH_PROVIDER", "This payment intent is not for a cash provider");
  }

  if (intent.status === "SUCCEEDED") {
    const existing = await prisma.paymentTransaction.findFirst({
      where: { paymentIntentId: intent.id, status: "SUCCEEDED" },
    });
    if (existing) {
      return existing;
    }
  }

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.paymentTransaction.create({
      data: {
        paymentIntentId: intent.id,
        providerId: intent.providerId,
        externalReference: generateReference("CASH"),
        status: "SUCCEEDED",
        amountCents: intent.amountCents,
        currencyId: intent.currencyId,
      },
    });

    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "SUCCEEDED" } });
    await handleSuccessfulTransaction(tx, transaction);

    return transaction;
  });
}

export interface WebhookHeaders {
  [key: string]: string | string[] | undefined;
}

/**
 * Generic webhook entry point for any registered adapter (§24: signature verified,
 * idempotent by (providerId, externalEventId) AND by PaymentTransaction's
 * (providerId, externalReference) — a duplicate delivery is a safe no-op at either
 * layer).
 */
export async function processWebhookEvent(
  providerCode: string,
  rawBody: string,
  headers: WebhookHeaders,
): Promise<void> {
  const provider = await prisma.paymentProvider.findUnique({ where: { code: providerCode } });

  if (!provider || !provider.isActive) {
    throw new AppError(404, "PAYMENT_PROVIDER_NOT_FOUND", `Unknown or inactive provider: ${providerCode}`);
  }

  const adapter = getPaymentProviderAdapter(providerCode);
  if (!adapter) {
    throw new AppError(501, "PROVIDER_NOT_CONFIGURED", `No webhook adapter registered for ${providerCode}`);
  }

  const signatureValid = adapter.verifyWebhookSignature({ rawBody, headers });

  let normalized: NormalizedWebhookEvent | null = null;
  let parseError: string | undefined;

  if (signatureValid) {
    try {
      normalized = adapter.parseWebhookEvent(rawBody);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  const externalEventId = normalized?.externalEventId ?? `invalid-${generateReference("EVT")}`;

  const existingEvent = await prisma.paymentWebhookEvent.findUnique({
    where: { providerId_externalEventId: { providerId: provider.id, externalEventId } },
  });

  if (existingEvent?.processedAt) {
    return;
  }

  const webhookEvent =
    existingEvent ??
    (await prisma.paymentWebhookEvent.create({
      data: {
        providerId: provider.id,
        externalEventId,
        signatureValid,
        payload: signatureValid ? (JSON.parse(rawBody) as Prisma.InputJsonValue) : { raw: rawBody },
      },
    }));

  if (!signatureValid) {
    throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed");
  }

  if (!normalized) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processingError: parseError ?? "Unknown parse error" },
    });
    throw new AppError(400, "WEBHOOK_PARSE_ERROR", parseError ?? "Could not parse webhook payload");
  }

  const intent = await prisma.paymentIntent.findUnique({
    where: { idempotencyKey: normalized.merchantReference },
  });

  if (!intent) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processingError: "No matching PaymentIntent for merchantReference" },
    });
    throw new AppError(404, "PAYMENT_INTENT_NOT_FOUND", "No matching payment intent for this webhook");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.create({
        data: {
          paymentIntentId: intent.id,
          providerId: provider.id,
          externalReference: normalized.externalReference,
          status: normalized.status,
          amountCents: normalized.amountCents,
          currencyId: intent.currencyId,
        },
      });

      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: normalized.status } });

      if (normalized.status === "SUCCEEDED") {
        await handleSuccessfulTransaction(tx, transaction);
      }

      await tx.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date() },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // A concurrent duplicate delivery created the PaymentTransaction first —
      // treat as already handled rather than surfacing an error to the caller.
      await prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date() },
      });
      return;
    }
    throw error;
  }
}
