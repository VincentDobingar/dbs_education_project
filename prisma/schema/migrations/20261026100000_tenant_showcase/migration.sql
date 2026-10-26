-- Vitrine des établissements sur la page d'accueil.
ALTER TABLE "Tenant" ADD COLUMN "publicDescription" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "showOnHomepage" BOOLEAN NOT NULL DEFAULT true;
