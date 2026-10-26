-- Cours de renforcement entre établissements (voir prisma/schema/remedial.prisma).

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'REMEDIAL_COURSE';

-- CreateEnum
CREATE TYPE "RemedialMode" AS ENUM ('ONSITE', 'ONLINE', 'HYBRID');
CREATE TYPE "RemedialFormat" AS ENUM ('INDIVIDUAL', 'GROUP');
CREATE TYPE "RemedialOfferStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CLOSED');
CREATE TYPE "RemedialEnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "RemedialPayoutBeneficiary" AS ENUM ('TEACHER', 'SCHOOL', 'PLATFORM');
CREATE TYPE "RemedialPayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "RemedialTariff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "format" "RemedialFormat" NOT NULL,
    "mode" "RemedialMode" NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "currencyId" TEXT NOT NULL,
    "schoolShareBps" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "approvedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemedialTariff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RemedialTariff_hourlyRateCents_check" CHECK ("hourlyRateCents" > 0),
    CONSTRAINT "RemedialTariff_schoolShareBps_check" CHECK ("schoolShareBps" BETWEEN 0 AND 10000)
);

-- CreateTable
CREATE TABLE "RemedialOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "subjectId" TEXT,
    "subjectLabel" TEXT NOT NULL,
    "levelLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mode" "RemedialMode" NOT NULL,
    "format" "RemedialFormat" NOT NULL,
    "location" TEXT,
    "accessDetails" TEXT,
    "capacity" INTEGER NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "scheduleNote" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currencyId" TEXT NOT NULL,
    "schoolShareBps" INTEGER NOT NULL,
    "platformShareBps" INTEGER NOT NULL,
    "status" "RemedialOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemedialOffer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RemedialOffer_capacity_check" CHECK ("capacity" > 0),
    CONSTRAINT "RemedialOffer_totalMinutes_check" CHECK ("totalMinutes" > 0),
    CONSTRAINT "RemedialOffer_shares_check" CHECK ("schoolShareBps" >= 0 AND "platformShareBps" >= 0 AND "schoolShareBps" + "platformShareBps" <= 10000)
);

-- CreateTable
CREATE TABLE "RemedialEnrollment" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "offerTenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "learnerTenantId" TEXT NOT NULL,
    "enrolledByUserId" TEXT NOT NULL,
    "enrolledAs" TEXT NOT NULL,
    "status" "RemedialEnrollmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "reference" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currencyId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemedialEnrollment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RemedialEnrollment_enrolledAs_check" CHECK ("enrolledAs" IN ('PARENT', 'STUDENT'))
);

-- CreateTable
CREATE TABLE "RemedialPayoutLine" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "beneficiary" "RemedialPayoutBeneficiary" NOT NULL,
    "tenantId" TEXT,
    "employeeId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currencyId" TEXT NOT NULL,
    "status" "RemedialPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidReference" TEXT,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemedialPayoutLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RemedialPayoutLine_amountCents_check" CHECK ("amountCents" >= 0)
);

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN "remedialEnrollmentId" TEXT;

-- CreateIndex
CREATE INDEX "RemedialTariff_tenantId_idx" ON "RemedialTariff"("tenantId");
CREATE INDEX "RemedialOffer_tenantId_idx" ON "RemedialOffer"("tenantId");
CREATE INDEX "RemedialOffer_employeeId_idx" ON "RemedialOffer"("employeeId");
CREATE INDEX "RemedialOffer_status_idx" ON "RemedialOffer"("status");
CREATE UNIQUE INDEX "RemedialEnrollment_reference_key" ON "RemedialEnrollment"("reference");
CREATE INDEX "RemedialEnrollment_offerTenantId_idx" ON "RemedialEnrollment"("offerTenantId");
CREATE INDEX "RemedialEnrollment_learnerTenantId_idx" ON "RemedialEnrollment"("learnerTenantId");
CREATE INDEX "RemedialEnrollment_enrolledByUserId_idx" ON "RemedialEnrollment"("enrolledByUserId");
CREATE UNIQUE INDEX "RemedialEnrollment_offerId_studentId_key" ON "RemedialEnrollment"("offerId", "studentId");
CREATE INDEX "RemedialPayoutLine_enrollmentId_idx" ON "RemedialPayoutLine"("enrollmentId");
CREATE INDEX "RemedialPayoutLine_tenantId_idx" ON "RemedialPayoutLine"("tenantId");
CREATE INDEX "RemedialPayoutLine_status_idx" ON "RemedialPayoutLine"("status");

-- AddForeignKey
ALTER TABLE "RemedialOffer" ADD CONSTRAINT "RemedialOffer_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "RemedialTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RemedialEnrollment" ADD CONSTRAINT "RemedialEnrollment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RemedialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RemedialPayoutLine" ADD CONSTRAINT "RemedialPayoutLine_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "RemedialEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_remedialEnrollmentId_fkey" FOREIGN KEY ("remedialEnrollmentId") REFERENCES "RemedialEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
