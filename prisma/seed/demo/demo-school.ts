/**
 * Données de démonstration pour UN établissement : structure (année, niveaux CP1 →
 * Terminale, classes, matières, salles), 100 élèves inscrits, 24 membres du
 * personnel, affectations enseignant × matière × classe et emplois du temps sans
 * conflit.
 *
 * Usage (connexion PROPRIÉTAIRE de la base — contourne la RLS, comme le seed) :
 *   DATABASE_URL=<url propriétaire> tsx prisma/seed/demo/demo-school.ts --tenant=<sous-domaine ou nom>
 *   … --dry-run   : exécute tout dans une transaction puis l'annule (validation sans écriture)
 *   … --cleanup   : retire uniquement les données marquées DEMO (élèves, personnel, cours)
 *
 * Tout est écrit dans UNE transaction : en cas d'erreur, rien n'est conservé.
 * Refuse de s'exécuter si des élèves DEMO existent déjà dans l'établissement.
 */
import { PrismaClient } from "@prisma/client";

import { cleanupDemo, seedDemo } from "./demo-data.js";
import { DEMO_MARKER } from "./plan.js";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

class DryRunRollback extends Error {}

async function resolveTenant(query: string): Promise<{ id: string; name: string }> {
  const byDomain = await prisma.tenantDomain.findUnique({
    where: { subdomain: query },
    include: { tenant: true },
  });
  if (byDomain) return { id: byDomain.tenant.id, name: byDomain.tenant.name };

  const matches = await prisma.tenant.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (matches.length === 1) return matches[0]!;
  const all = await prisma.tenant.findMany({
    select: { name: true, domains: { select: { subdomain: true } } },
  });
  console.error(
    `Établissement introuvable ou ambigu pour « ${query} ». Disponibles :\n` +
      all
        .map((tenant) => `  - ${tenant.name} (${tenant.domains.map((d) => d.subdomain).join(", ")})`)
        .join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const query = arg("tenant");
  if (!query) {
    console.error("Préciser l'établissement : --tenant=<sous-domaine ou nom>");
    process.exit(1);
  }
  const dryRun = hasFlag("dry-run");
  const cleanup = hasFlag("cleanup");
  const tenant = await resolveTenant(query);
  console.log(`Établissement : ${tenant.name}${dryRun ? " — DRY RUN (aucune écriture conservée)" : ""}`);

  if (!cleanup) {
    const existing = await prisma.student.count({
      where: { tenantId: tenant.id, matricule: { startsWith: `${DEMO_MARKER}-` } },
    });
    if (existing > 0) {
      console.error(`${existing} élèves de démonstration existent déjà. Lancer d'abord --cleanup.`);
      process.exit(1);
    }
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const summary = cleanup ? await cleanupDemo(tx, tenant.id) : await seedDemo(tx, tenant.id);
        console.log(cleanup ? "Supprimé :" : "Créé :");
        for (const [label, count] of Object.entries(summary)) console.log(`  ${label} : ${count}`);
        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 180_000, maxWait: 10_000 },
    );
    console.log("Terminé.");
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log("Dry run : transaction annulée, rien n'a été écrit.");
      return;
    }
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
