-- Pays africains : code ISO 3166-1 alpha-3 et région de l'Union africaine.
CREATE TYPE "CountryRegion" AS ENUM ('CENTRAL_AFRICA', 'EAST_AFRICA', 'NORTH_AFRICA', 'SOUTHERN_AFRICA', 'WEST_AFRICA');

ALTER TABLE "Country" ADD COLUMN "isoAlpha3" TEXT,
ADD COLUMN "region" "CountryRegion";

CREATE UNIQUE INDEX "Country_isoAlpha3_key" ON "Country"("isoAlpha3");
