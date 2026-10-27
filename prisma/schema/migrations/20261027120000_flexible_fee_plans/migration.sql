-- Inscription et échéancier flexibles : rubriques typées, grille nouveau / ancien
-- élève, plans d'échéances ancrés sur les périodes scolaires, contrat financier de
-- l'élève, remises, avoirs, rappels. Toutes les nouvelles tables sont sous RLS.

-- AlterEnum : règlement d'une échéance par un avoir (trop-perçu antérieur).
ALTER TYPE "PaymentMethodType" ADD VALUE 'CREDIT';

-- CreateEnum
CREATE TYPE "FeeNature" AS ENUM ('REGISTRATION', 'TUITION', 'ANNEX', 'EXAM');
CREATE TYPE "FeeStudentType" AS ENUM ('ALL', 'NEW', 'RETURNING');
CREATE TYPE "FeeAnchorType" AS ENUM ('ENROLLMENT', 'PERIOD_START', 'FIXED_DATE');
CREATE TYPE "FeeDiscountKind" AS ENUM ('PERCENT', 'AMOUNT');
CREATE TYPE "FeeAgreementStatus" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TYPE "StudentInvoiceKind" AS ENUM ('MANUAL', 'REGISTRATION', 'INSTALLMENT', 'PENALTY');
CREATE TYPE "FeeReminderKind" AS ENUM ('BEFORE_DUE', 'AFTER_DUE', 'LONG_OVERDUE');

-- AlterTable
ALTER TABLE "FeeCategory" ADD COLUMN "nature" "FeeNature" NOT NULL DEFAULT 'TUITION',
ADD COLUMN "isRefundable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FeeStructure" ADD COLUMN "studentType" "FeeStudentType" NOT NULL DEFAULT 'ALL',
ADD COLUMN "programId" TEXT,
ADD COLUMN "dueWithInstallment" INTEGER;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_dueWithInstallment_check" CHECK ("dueWithInstallment" IS NULL OR "dueWithInstallment" BETWEEN 1 AND 12);

ALTER TABLE "StudentInvoice" ADD COLUMN "kind" "StudentInvoiceKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "agreementId" TEXT,
ADD COLUMN "installmentSequence" INTEGER,
ADD COLUMN "penaltyForInvoiceId" TEXT;

-- Les échéances créées par l'ancien échéancier des périodes d'inscription
-- (numéro INS-<inscription>-<n>) deviennent des tranches.
UPDATE "StudentInvoice" SET "kind" = 'INSTALLMENT' WHERE "number" LIKE 'INS-%';

ALTER TABLE "PaymentIntent" ADD COLUMN "tenantId" TEXT;

-- Avec un plan d'échéances, une période d'inscription ne porte plus de montants :
-- son ancien échéancier (1 à 3 tranches) devient facultatif.
ALTER TABLE "RegistrationPeriod" DROP CONSTRAINT "RegistrationPeriod_installments_check";
ALTER TABLE "RegistrationPeriod" ADD CONSTRAINT "RegistrationPeriod_installments_check" CHECK (jsonb_typeof("installments") = 'array' AND jsonb_array_length("installments") BETWEEN 0 AND 3);

ALTER TABLE "StudentPayment" ADD COLUMN "allocationGroupId" TEXT,
ADD COLUMN "platformSettledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FeePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "educationCycleId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeePlanInstallment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feePlanId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "anchorType" "FeeAnchorType" NOT NULL,
    "academicPeriodId" TEXT,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "fixedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeePlanInstallment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeePlanInstallment_sequence_check" CHECK ("sequence" BETWEEN 1 AND 12),
    CONSTRAINT "FeePlanInstallment_shareBps_check" CHECK ("shareBps" BETWEEN 0 AND 10000),
    CONSTRAINT "FeePlanInstallment_anchor_check" CHECK (
      ("anchorType" = 'PERIOD_START' AND "academicPeriodId" IS NOT NULL)
      OR ("anchorType" = 'FIXED_DATE' AND "fixedDate" IS NOT NULL)
      OR "anchorType" = 'ENROLLMENT'
    )
);

CREATE TABLE "FeeDiscountPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FeeDiscountKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeDiscountPreset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeeDiscountPreset_value_check" CHECK ("value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 10000))
);

CREATE TABLE "StudentFeeAgreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "feePlanId" TEXT,
    "isReturning" BOOLEAN NOT NULL,
    "lines" JSONB NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "status" "FeeAgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeAgreement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentFeeAgreement_amounts_check" CHECK ("grossCents" >= 0 AND "discountCents" >= 0 AND "totalCents" = "grossCents" - "discountCents")
);

CREATE TABLE "StudentFeeDiscount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "presetId" TEXT,
    "label" TEXT NOT NULL,
    "kind" "FeeDiscountKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentFeeDiscount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentFeeDiscount_amount_check" CHECK ("amountCents" >= 0)
);

CREATE TABLE "StudentCredit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "remainingCents" INTEGER NOT NULL,
    "allocationGroupId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCredit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentCredit_amounts_check" CHECK ("amountCents" > 0 AND "remainingCents" BETWEEN 0 AND "amountCents")
);

CREATE TABLE "FeeReminderLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "FeeReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeePlan_tenantId_academicYearId_name_key" ON "FeePlan"("tenantId", "academicYearId", "name");
CREATE INDEX "FeePlan_tenantId_idx" ON "FeePlan"("tenantId");
CREATE INDEX "FeePlan_academicYearId_idx" ON "FeePlan"("academicYearId");
CREATE UNIQUE INDEX "FeePlanInstallment_feePlanId_sequence_key" ON "FeePlanInstallment"("feePlanId", "sequence");
CREATE INDEX "FeePlanInstallment_tenantId_idx" ON "FeePlanInstallment"("tenantId");
CREATE UNIQUE INDEX "FeeDiscountPreset_tenantId_name_key" ON "FeeDiscountPreset"("tenantId", "name");
CREATE INDEX "FeeDiscountPreset_tenantId_idx" ON "FeeDiscountPreset"("tenantId");
CREATE UNIQUE INDEX "StudentFeeAgreement_enrollmentId_key" ON "StudentFeeAgreement"("enrollmentId");
CREATE INDEX "StudentFeeAgreement_tenantId_idx" ON "StudentFeeAgreement"("tenantId");
CREATE INDEX "StudentFeeAgreement_studentId_idx" ON "StudentFeeAgreement"("studentId");
CREATE INDEX "StudentFeeDiscount_tenantId_idx" ON "StudentFeeDiscount"("tenantId");
CREATE INDEX "StudentFeeDiscount_agreementId_idx" ON "StudentFeeDiscount"("agreementId");
CREATE INDEX "StudentCredit_tenantId_idx" ON "StudentCredit"("tenantId");
CREATE INDEX "StudentCredit_studentId_idx" ON "StudentCredit"("studentId");
CREATE UNIQUE INDEX "FeeReminderLog_invoiceId_kind_key" ON "FeeReminderLog"("invoiceId", "kind");
CREATE INDEX "FeeReminderLog_tenantId_idx" ON "FeeReminderLog"("tenantId");
CREATE UNIQUE INDEX "StudentInvoice_penaltyForInvoiceId_key" ON "StudentInvoice"("penaltyForInvoiceId");
CREATE INDEX "StudentInvoice_agreementId_idx" ON "StudentInvoice"("agreementId");
CREATE INDEX "StudentPayment_allocationGroupId_idx" ON "StudentPayment"("allocationGroupId");

-- AddForeignKey
ALTER TABLE "FeePlanInstallment" ADD CONSTRAINT "FeePlanInstallment_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "FeePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAgreement" ADD CONSTRAINT "StudentFeeAgreement_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFeeAgreement" ADD CONSTRAINT "StudentFeeAgreement_feePlanId_fkey" FOREIGN KEY ("feePlanId") REFERENCES "FeePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentFeeDiscount" ADD CONSTRAINT "StudentFeeDiscount_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "StudentFeeAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentInvoice" ADD CONSTRAINT "StudentInvoice_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "StudentFeeAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security
ALTER TABLE "FeePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeePlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeePlan"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FeePlanInstallment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeePlanInstallment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeePlanInstallment"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FeeDiscountPreset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeDiscountPreset" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeDiscountPreset"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentFeeAgreement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentFeeAgreement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentFeeAgreement"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentFeeDiscount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentFeeDiscount" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentFeeDiscount"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "StudentCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentCredit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentCredit"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "FeeReminderLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeReminderLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeReminderLog"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
