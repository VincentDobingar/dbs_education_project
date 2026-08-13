-- CreateTable
CREATE TABLE "StudentPaymentRefund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentPaymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedByEmployeeId" TEXT,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentPaymentRefund_tenantId_idx" ON "StudentPaymentRefund"("tenantId");

-- CreateIndex
CREATE INDEX "StudentPaymentRefund_studentPaymentId_idx" ON "StudentPaymentRefund"("studentPaymentId");

-- AddForeignKey
ALTER TABLE "StudentPaymentRefund" ADD CONSTRAINT "StudentPaymentRefund_studentPaymentId_fkey" FOREIGN KEY ("studentPaymentId") REFERENCES "StudentPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (§2), same pattern as every other tenant-scoped table since
-- 20260806170000_enable_row_level_security.
ALTER TABLE "StudentPaymentRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPaymentRefund" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentPaymentRefund"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
