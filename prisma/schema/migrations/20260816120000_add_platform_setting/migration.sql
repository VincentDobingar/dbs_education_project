-- CreateTable: PlatformSetting — parametres globaux (§31), forme cle/valeur de
-- TenantSetting mais sans tenantId : "key" porte directement sa propre contrainte
-- unique (pas de piege NULL possible puisqu'il n'y a pas de colonne tenantId).
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");
