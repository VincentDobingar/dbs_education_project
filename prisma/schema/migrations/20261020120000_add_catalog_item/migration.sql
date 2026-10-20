-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('EDUCATION_CYCLE', 'GRADE_LEVEL', 'SUBJECT', 'ASSESSMENT_TYPE', 'FEE_CATEGORY');

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "code" TEXT NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogItem_kind_isActive_idx" ON "CatalogItem"("kind", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_kind_code_key" ON "CatalogItem"("kind", "code");
