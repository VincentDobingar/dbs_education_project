-- §2/§37 : quatre tables tenant-scopees restaient sans protection RLS. Les deux
-- couches (garde applicative dans prisma.ts + RLS) sont deliberement independantes ;
-- celle-ci comblait un angle mort reel decouvert par un audit de couverture complet
-- du cahier des charges (§2, §33).
--
-- StudentInvoiceItem/ReportCardItem/GradeChangeLog n'ont pas de colonne tenantId
-- propre (lignes filles crees/lues via leur parent tenant-scope) : la politique
-- verifie le tenant du parent par sous-requete. Chaque site d'appel direct sur ces
-- tables (hors ecriture imbriquee sous le parent, deja protegee) est desormais
-- enveloppe dans withTenantSession pour garantir que app.tenant_id est bien positionne
-- au moment ou Postgres evalue la politique (voir report-card.service.ts,
-- grade.service.ts).
--
-- ActivationCode et SupportTicketMessage restent volontairement SANS RLS : la
-- redemption d'un code se fait par hash avant qu'aucun contexte tenant n'existe
-- (meme raison documentee pour TenantDomain, migration 20260806193000), et les
-- messages de ticket sont lus/ecrits par la super-administration a travers tous les
-- tenants (support-ticket-admin.service.ts) — leur imposer RLS casserait ces deux
-- usages legitimes plutot que de fermer un vrai trou.

ALTER TABLE "StudentInvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentInvoiceItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentInvoiceItem"
  USING (EXISTS (
    SELECT 1 FROM "StudentInvoice"
    WHERE "StudentInvoice".id = "StudentInvoiceItem"."invoiceId"
      AND "StudentInvoice"."tenantId" = current_setting('app.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "StudentInvoice"
    WHERE "StudentInvoice".id = "StudentInvoiceItem"."invoiceId"
      AND "StudentInvoice"."tenantId" = current_setting('app.tenant_id', true)
  ));

ALTER TABLE "ReportCardItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportCardItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReportCardItem"
  USING (EXISTS (
    SELECT 1 FROM "ReportCard"
    WHERE "ReportCard".id = "ReportCardItem"."reportCardId"
      AND "ReportCard"."tenantId" = current_setting('app.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "ReportCard"
    WHERE "ReportCard".id = "ReportCardItem"."reportCardId"
      AND "ReportCard"."tenantId" = current_setting('app.tenant_id', true)
  ));

ALTER TABLE "GradeChangeLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GradeChangeLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GradeChangeLog"
  USING (EXISTS (
    SELECT 1 FROM "Grade"
    WHERE "Grade".id = "GradeChangeLog"."gradeId"
      AND "Grade"."tenantId" = current_setting('app.tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Grade"
    WHERE "Grade".id = "GradeChangeLog"."gradeId"
      AND "Grade"."tenantId" = current_setting('app.tenant_id', true)
  ));

-- StudentTransfer porte fromTenantId/toTenantId au lieu d'un tenantId unique —
-- visible pour l'un ou l'autre des deux etablissements parties au transfert, jamais
-- pour un tiers. transfer.service.ts enveloppe desormais chaque requete dans
-- withTenantSession avec le tenant courant de l'appelant.
ALTER TABLE "StudentTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentTransfer"
  USING (
    "fromTenantId" = current_setting('app.tenant_id', true)
    OR "toTenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "fromTenantId" = current_setting('app.tenant_id', true)
    OR "toTenantId" = current_setting('app.tenant_id', true)
  );
