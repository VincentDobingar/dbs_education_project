/** Activation explicite de toutes les couvertures locales parent/élève pour les tests. */
import { PrismaClient, type Prisma, type Subscription } from "@prisma/client";
const p = new PrismaClient();
const MARKER = "LOCAL-ALL-PORTALS";
type Tx = Prisma.TransactionClient;
async function activate(tx: Tx, subscription: Subscription, planId: string, actor: string) {
  const expiry = new Date(Date.now() + 365 * 86400000);
  const updated = await tx.subscription.update({
    where: { id: subscription.id },
    data: {
      planId,
      status: "ACTIVE",
      deletedAt: null,
      startsAt: subscription.startsAt ?? new Date(),
      endsAt: null,
      currentPeriodEndsAt: expiry,
      graceEndsAt: null,
      trialEndsAt: null,
      cancelledAt: null,
      cancelReason: null,
      autoRenew: false,
    },
  });
  if (subscription.status !== "ACTIVE" || subscription.planId !== planId)
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: updated.id,
        fromStatus: subscription.status,
        toStatus: "ACTIVE",
        actorUserId: actor,
        reason: "Activation fictive locale demandée pour les tests parent/élève",
      },
    });
  for (const feature of await tx.planFeature.findMany({ where: { planId } }))
    await tx.entitlement.upsert({
      where: { subscriptionId_featureCode: { subscriptionId: updated.id, featureCode: feature.featureCode } },
      update: {
        isEnabled: feature.isIncluded,
        quotaLimit: feature.quotaLimit,
        expiresAt: expiry,
        computedAt: new Date(),
      },
      create: {
        subscriptionId: updated.id,
        featureCode: feature.featureCode,
        isEnabled: feature.isIncluded,
        quotaLimit: feature.quotaLimit,
        expiresAt: expiry,
      },
    });
  return updated;
}
async function main() {
  const db = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || !db.pathname.endsWith("_dev"))
    throw new Error("Réservé à la base locale de développement");
  await p.$transaction(
    async (tx) => {
      const actor = await tx.user.findUniqueOrThrow({ where: { email: "dobingar.vincent@dbs-africa.org" } });
      const familyPlan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: "FAMILY_PLAN" } });
      const studentPlan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: "STUDENT_PREMIUM" } });
      const existing = await tx.subscription.findMany({
        where: { deletedAt: null, owner: { ownerType: { in: ["PARENT", "STUDENT"] } } },
        include: { owner: true },
      });
      for (const sub of existing)
        await activate(tx, sub, sub.owner.ownerType === "PARENT" ? familyPlan.id : studentPlan.id, actor.id);
      const links = await tx.parentStudentRelationship.findMany({
        where: { status: "VERIFIED", revokedAt: null, student: { deletedAt: null } },
        orderBy: { createdAt: "asc" },
      });
      for (const link of links) {
        if (
          await tx.parentSubscriptionCoverage.findFirst({
            where: { studentId: link.studentId, tenantId: link.tenantId, releasedAt: null },
          })
        )
          continue;
        const user = await tx.user.findUniqueOrThrow({
          where: { id: link.parentUserId },
          include: { profile: true },
        });
        let family = await tx.familyAccount.findFirst({ where: { primaryUserId: user.id, deletedAt: null } });
        if (!family) {
          const guardian = await tx.guardian.upsert({
            where: { userId: user.id },
            update: {},
            create: {
              userId: user.id,
              firstName: user.profile?.firstName ?? "Parent",
              lastName: user.profile?.lastName ?? "Test",
              email: user.email,
            },
          });
          family = await tx.familyAccount.create({
            data: {
              primaryUserId: user.id,
              members: { create: { guardianId: guardian.id, roleInFamily: "PRIMARY" } },
            },
          });
        }
        const owner = await tx.subscriptionOwner.upsert({
          where: { familyAccountId: family.id },
          update: {},
          create: { ownerType: "PARENT", familyAccountId: family.id },
        });
        const candidates = await tx.subscription.findMany({
          where: { ownerId: owner.id, status: "ACTIVE", deletedAt: null },
          include: { _count: { select: { parentCoverages: true } } },
        });
        let sub = candidates.find(
          (candidate) => candidate._count.parentCoverages < (familyPlan.childrenCovered ?? 5),
        );
        if (!sub) {
          const created = await tx.subscription.create({
            data: {
              ownerId: owner.id,
              planId: familyPlan.id,
              status: "DRAFT",
              fundingSource: "SELF_PAID",
              billingPeriod: "ANNUAL",
              externalPaymentReference: MARKER,
            },
          });
          await activate(tx, created, familyPlan.id, actor.id);
          sub = { ...created, _count: { parentCoverages: 0 } };
        }
        await tx.parentSubscriptionCoverage.create({
          data: {
            parentUserId: user.id,
            studentId: link.studentId,
            tenantId: link.tenantId,
            subscriptionId: sub.id,
          },
        });
      }
      const studentIds = new Set((await tx.studentUserLink.findMany()).map((link) => link.studentId));
      const schools = await tx.tenant.findMany({
        where: { domains: { some: { subdomain: { in: ["aurigeo", "ecolevie"] } } }, deletedAt: null },
      });
      for (const school of schools) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${school.id}, true)`;
        for (const student of await tx.student.findMany({
          where: { tenantId: school.id, matricule: { startsWith: "LOCAL-PARCOURS-" }, deletedAt: null },
        }))
          studentIds.add(student.id);
      }
      for (const studentId of studentIds) {
        const owner = await tx.subscriptionOwner.upsert({
          where: { studentId: studentId },
          update: {},
          create: { ownerType: "STUDENT", studentId: studentId },
        });
        let sub = await tx.subscription.findFirst({
          where: { ownerId: owner.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
        });
        sub ??= await tx.subscription.create({
          data: {
            ownerId: owner.id,
            planId: studentPlan.id,
            status: "DRAFT",
            fundingSource: "SELF_PAID",
            billingPeriod: "ANNUAL",
            externalPaymentReference: MARKER,
          },
        });
        await activate(tx, sub, studentPlan.id, actor.id);
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "LOCAL_TEST_ALL_PORTALS_ACTIVATED",
          entityType: "Subscription",
          entityId: MARKER,
          afterData: { parentRelationships: links.length, studentRecords: studentIds.size },
        },
      });
      console.log(
        JSON.stringify({
          liensParentsCouverts: links.length,
          dossiersEleves: studentIds.size,
          abonnementsActifs: await tx.subscription.count({
            where: { status: "ACTIVE", deletedAt: null, owner: { ownerType: { in: ["PARENT", "STUDENT"] } } },
          }),
        }),
      );
    },
    { timeout: 120000 },
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void p.$disconnect());
