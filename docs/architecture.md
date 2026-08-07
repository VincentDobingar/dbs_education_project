# Architecture — EduManage Africa

Ce document résume les décisions validées et l'état réel de l'implémentation. Le cahier des charges complet reste [prompt_dbs_edu_africa.txt](../prompt_dbs_edu_africa.txt) ; ce fichier documente ce qui a été _décidé et construit_, pas ce qui est _souhaité_.

## Décisions validées

| Sujet                    | Décision                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multitenance             | Base/schéma PostgreSQL partagés + colonne `tenantId` sur chaque table métier + Row-Level Security Postgres + extension Prisma qui applique le filtre tenant automatiquement. Jamais de `tenant_id` accepté depuis le client.                                                              |
| Résolution du tenant     | Sous-domaine (`TenantDomain`) + membership vérifié de l'utilisateur authentifié. Jamais un paramètre libre de requête.                                                                                                                                                                    |
| Monorepo                 | pnpm workspaces + Turborepo                                                                                                                                                                                                                                                               |
| Paiements — priorité MVP | Afrique centrale (zone CEMAC : Orange Money, MTN MoMo, Airtel Money) et Afrique de l'Est (M-Pesa, MTN MoMo, Airtel Money) en premier ; UEMOA et autres zones ensuite. Architecture par adaptateurs (`PaymentProvider`) dès la Phase 3 pour ne pas bloquer l'ajout ultérieur d'opérateurs. |
| Hébergement production   | Coolify auto-hébergé sur VPS (panneau graphique gratuit orienté Docker/Node/Postgres/Redis, alternative à cPanel qui ne convient pas à cette stack)                                                                                                                                       |
| Portée MVP               | Cœur uniquement : académique + finance + abonnements + portails. Aucun module complémentaire (bibliothèque, transport, cantine, internat, e-learning) au MVP — Phase 10.                                                                                                                  |
| Auth                     | Argon2id pour les mots de passe, access token JWT courte durée (15 min) + refresh token opaque haché et rotatif                                                                                                                                                                           |

## Stratégie multitenant (implémentée, Phase 2)

Deux couches de défense indépendantes, aucune ne suffisant seule :

1. **Extension Prisma** ([apps/api/src/lib/prisma.ts](../apps/api/src/lib/prisma.ts)) : intercepte chaque opération sur les modèles listés dans `TENANT_SCOPED_MODELS` ([tenant-scoped-models.ts](../apps/api/src/lib/tenant-scoped-models.ts), 40 modèles) et fusionne/valide `tenantId` contre le contexte `AsyncLocalStorage` posé par `enforceTenantScope`. Une requête sans contexte tenant lève une erreur plutôt que de s'exécuter sans filtre.
2. **Row-Level Security PostgreSQL** (migrations `enable_row_level_security` + corrections listées ci-dessous) : chaque opération scopée passe par une micro-transaction qui exécute `SELECT set_config('app.tenant_id', <tenantId>, true)` avant la requête réelle — le même mécanisme protège même un accès qui contournerait l'extension applicative.

**Le rôle applicatif ne doit jamais être le superuser Postgres** : RLS est totalement ignorée pour un superuser ou un rôle `BYPASSRLS`, quel que soit `FORCE ROW LEVEL SECURITY`. L'app tourne sous un rôle dédié `edumanage_app` (créé manuellement, hors migration versionnée — voir `docs/architecture.md#notes-denvironnement-de-développement`), avec uniquement les privilèges DML nécessaires.

**Exceptions RLS documentées** — deux tables ont RLS explicitement désactivée, chacune via une migration dédiée expliquant pourquoi :

- `TenantDomain` : résoudre un sous-domaine vers un tenant est par nature une lecture _avant_ qu'aucun contexte tenant n'existe (c'est justement ce que cette requête établit). RLS rendrait ce bootstrap impossible.
- `ParentStudentRelationship` : même catégorie de problème — retrouver le tenant d'un enfant à partir de `(parentUserId, studentId)` doit fonctionner avant que le tenant ne soit connu (§9, portail parent multi-établissement). Le lookup reste sûr car c'est toujours une clé composite exacte, jamais un scan, et le statut `VERIFIED` + l'absence de révocation restent vérifiés par le middleware.

Toute future table jouant ce rôle de « point d'entrée de résolution de tenant » doit suivre le même traitement, avec la même justification enregistrée dans sa migration.

**Limite connue** : le garde applicatif enveloppe chaque appel Prisma dans sa propre micro-transaction. Un service qui a besoin de plusieurs écritures scopées atomiques ensemble (ex. opération financière débitant une ligne et créditant une autre, §23/§40) ne doit pas compter sur ce comportement — un helper dédié ouvrant une transaction explicite unique reste à construire quand le premier service de ce type sera écrit (Phase 3+), plutôt que d'en deviner la forme maintenant.

Tests d'isolation (Phase 2, [apps/api/src/test/integration/](../apps/api/src/test/integration/)) : 23 tests couvrant l'extension Prisma + RLS directement, la chaîne RBAC complète, `requireActiveSubscription`/`requireEntitlement` (y compris quotas et non-suppression des données à l'expiration), et `requireVerifiedStudentRelationship` (enfants vérifiés, multi-tenant, révocation immédiate, paiement seul insuffisant).

## Modèle d'abonnement (implémenté, Phase 2)

- `Subscription` rattaché à un `SubscriptionOwner` polymorphe (`Tenant`, `FamilyAccount`, `Student` ou `Organization`) via des FK nullables + discriminant `ownerType` (Prisma ne supporte pas les FK polymorphes natives) — table séparée plutôt que des champs directs sur `Subscription`, pour que `BillingAccount` et `LicenseAssignment` référencent le même point d'ancrage sans dupliquer la logique polymorphe.
- Statuts (`DRAFT`…`REFUNDED`) et transitions tracées via `SubscriptionEvent` (immuable). La machine à états explicite (services) reste à construire en Phase 3.
- Le lien parent-enfant (`ParentStudentRelationship`) est indépendant du paiement : il naît uniquement du parcours d'activation sécurisé (invitation → code d'activation à usage unique, haché, jamais stocké en clair → vérification → activation), jamais d'une simple déclaration ou d'un paiement — testé explicitement.
- Le tableau de bord parent consolidé interroge chaque tenant séparément avec le contexte de l'enfant concerné (voir `requireVerifiedStudentRelationship`) — jamais de jointure cross-tenant en base.

Schéma complet : `prisma/schema/*.prisma` (10 fichiers par domaine, 88 modèles).

## Chaîne d'autorisation backend (implémentée, Phase 2)

```
requireAuth
  → requirePlatformRole        (routes super-admin)
  → enforceTenantScope         (résout et verrouille le tenant de la requête)
  → requireTenantMembership
  → requirePermission(permission)
  → requireVerifiedStudentRelationship  (routes ciblant un élève, cas parent — verrouille le tenant sur celui de l'enfant)
  → requireActiveSubscription(ownerType)
  → requireEntitlement(feature)
```

Chaque middleware ([apps/api/src/middleware/](../apps/api/src/middleware/)) est testable isolément. Aucun contrôleur ne fait sa propre vérification d'autorisation.

## Phases de développement

Voir §38 du cahier des charges pour le détail complet.

- **Phase 1 — Fondation** : terminée (monorepo, squelettes apps/packages, Docker Compose dev, qualité, CI).
- **Phase 2 — Données et sécurité** : terminée (schéma Prisma complet, migrations + RLS, authentification, RBAC, isolation multitenant testée). Restent hors périmètre Phase 2 : vérification email/téléphone effective (compte créé `ACTIVE` directement pour l'instant, voir TODO dans `auth.service.ts`), audit logging effectif (la table `AuditLog` existe, aucun service n'y écrit encore), MFA.
- **Phase 3 — Abonnements** : prochaine étape (plans, prix, entitlements complets, paiements, webhooks, licences sponsorisées de bout en bout).
- Phases 4 à 11 : selon le plan validé, non commencées.

## Notes d'environnement de développement

- pnpm n'a pas pu être activé globalement sur cette machine (droits administrateur requis pour écrire dans `C:\Program Files\nodejs`). Shim installé dans `C:\Users\PC\bin` (déjà dans le PATH) ; `pnpm` fonctionne normalement dans ce terminal.
- Postgres tourne nativement sur cette machine (pas Docker — Docker Desktop n'a pas pu être démarré). Bases `edumanage_dev` et `edumanage_test`, utilisateur superuser `postgres`.
- Rôle applicatif `edumanage_app` créé manuellement (hors migration versionnée, car création de rôle + mot de passe ne doit jamais être dans un fichier commité) : privilèges DML uniquement sur les deux bases, sans `BYPASSRLS`. Identifiants dans `apps/api/.env` / `apps/worker/.env` (gitignorés). Un environnement de production devra recréer ce rôle avec son propre mot de passe via le secrets manager de l'hébergeur (Coolify), jamais en réutilisant celui du dev.
- `docker/docker-compose.yml` reste la référence pour un environnement Docker standard ; non utilisé sur cette machine faute de daemon disponible.
