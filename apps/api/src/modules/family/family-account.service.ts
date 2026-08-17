import type { FamilyAccount, FamilyMember, Guardian } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";

import type { CreateFamilyAccountInput, UpdateFamilyAccountInput } from "./family-account.validation.js";

export type FamilyAccountWithMembers = FamilyAccount & { members: (FamilyMember & { guardian: Guardian })[] };

/**
 * §9 : un `FamilyAccount` s'appuie sur un `Guardian` (le tuteur légal au sens
 * métier), pas directement sur `User` — un `Guardian` peut exister sans compte
 * actif (§8 : saisi par l'établissement), donc on en crée un ici s'il n'existe pas
 * encore pour cet utilisateur, à partir de son profil déjà renseigné.
 */
async function requireGuardianForUser(userId: string): Promise<Guardian> {
  const existing = await rawPrisma.guardian.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  const user = await rawPrisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user?.profile) {
    throw new AppError(400, "PROFILE_REQUIRED", "A user profile is required to create a family account");
  }

  return rawPrisma.guardian.create({
    data: {
      userId,
      firstName: user.profile.firstName,
      lastName: user.profile.lastName,
      email: user.email,
      ...(user.phone ? { phone: user.phone } : {}),
    },
  });
}

async function findFamilyAccountForUser(userId: string): Promise<FamilyAccountWithMembers | null> {
  return rawPrisma.familyAccount.findFirst({
    where: { primaryUserId: userId, deletedAt: null },
    include: { members: { include: { guardian: true } } },
  });
}

export async function requireFamilyAccountForUser(userId: string): Promise<FamilyAccountWithMembers> {
  const familyAccount = await findFamilyAccountForUser(userId);
  if (!familyAccount) {
    throw new AppError(404, "FAMILY_ACCOUNT_NOT_FOUND", "You have no family account yet");
  }
  return familyAccount;
}

export async function createFamilyAccount(
  userId: string,
  input: CreateFamilyAccountInput,
): Promise<FamilyAccountWithMembers> {
  const existing = await findFamilyAccountForUser(userId);
  if (existing) {
    throw new AppError(409, "FAMILY_ACCOUNT_ALREADY_EXISTS", "You already have a family account");
  }

  const guardian = await requireGuardianForUser(userId);

  const familyAccount = await rawPrisma.familyAccount.create({
    data: {
      primaryUserId: userId,
      ...(input.maxChildren !== undefined ? { maxChildren: input.maxChildren } : {}),
      members: { create: { guardianId: guardian.id, roleInFamily: "PRIMARY" } },
    },
    include: { members: { include: { guardian: true } } },
  });

  return familyAccount;
}

/** Seul le titulaire principal (`primaryUserId`) peut ajuster le plafond — pas un `CO_GUARDIAN` du foyer. */
export async function updateFamilyAccount(
  userId: string,
  input: UpdateFamilyAccountInput,
): Promise<FamilyAccountWithMembers> {
  const familyAccount = await requireFamilyAccountForUser(userId);

  await rawPrisma.familyAccount.update({
    where: { id: familyAccount.id },
    data: { ...(input.maxChildren !== undefined ? { maxChildren: input.maxChildren } : {}) },
  });

  return requireFamilyAccountForUser(userId);
}

/**
 * §9 : « un abonnement familial doit définir le nombre maximum d'enfants couverts ».
 * Aucun plafond si le parent n'a pas (encore) de `FamilyAccount`, ou si son
 * `maxChildren` est resté `null` (illimité) — le plafond n'est jamais implicite.
 */
export async function assertChildLimitNotReached(
  userId: string,
  currentVerifiedCount: number,
): Promise<void> {
  const familyAccount = await findFamilyAccountForUser(userId);
  if (!familyAccount || familyAccount.maxChildren === null) {
    return;
  }

  if (currentVerifiedCount + 1 > familyAccount.maxChildren) {
    throw new AppError(
      409,
      "FAMILY_CHILD_LIMIT_REACHED",
      `This family account is limited to ${familyAccount.maxChildren} children`,
    );
  }
}
