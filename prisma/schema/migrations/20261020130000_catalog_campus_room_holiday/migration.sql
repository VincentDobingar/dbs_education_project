-- AlterEnum
ALTER TYPE "CatalogKind" ADD VALUE 'CAMPUS';
ALTER TYPE "CatalogKind" ADD VALUE 'ROOM';
ALTER TYPE "CatalogKind" ADD VALUE 'HOLIDAY';

-- AlterTable
ALTER TABLE "CatalogItem" ADD COLUMN     "countryIsoCode" TEXT,
ADD COLUMN     "day" INTEGER,
ADD COLUMN     "month" INTEGER;

-- CreateIndex
CREATE INDEX "CatalogItem_kind_countryIsoCode_idx" ON "CatalogItem"("kind", "countryIsoCode");
