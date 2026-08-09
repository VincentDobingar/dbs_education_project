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

**Limite connue** : le garde applicatif enveloppe chaque appel Prisma dans sa propre micro-transaction. Un service qui a besoin de plusieurs écritures scopées atomiques ensemble (ex. opération financière débitant une ligne et créditant une autre, §23/§40) ne doit pas compter sur ce comportement seul. Note Phase 3 : pour les modèles NON tenant-scopés (Subscription, Invoice, PaymentTransaction, ...), ce n'est pas un problème — `payment.service.ts` compose `prisma.$transaction(tx => ...)` avec `applySubscriptionTransition(tx, ...)` directement, une seule transaction couvrant paiement + facture + abonnement + reçu (voir `handleSuccessfulTransaction`). Résolu en Phase 4 pour les écritures **tenant-scopées** atomiques ensemble : `withTenantSession(tenantId, fn)` ([apps/api/src/lib/prisma.ts](../apps/api/src/lib/prisma.ts)) ouvre une seule `rawPrisma.$transaction`, positionne `app.tenant_id` une fois, puis expose le client transactionnel brut — première utilisation réelle dans `tenant.service.ts` (création de la `TenantMembership` + du `UserRole` SCHOOL_OWNER en une seule transaction).

Tests d'isolation (Phase 2, [apps/api/src/test/integration/](../apps/api/src/test/integration/)) : 23 tests couvrant l'extension Prisma + RLS directement, la chaîne RBAC complète, `requireActiveSubscription`/`requireEntitlement` (y compris quotas et non-suppression des données à l'expiration), et `requireVerifiedStudentRelationship` (enfants vérifiés, multi-tenant, révocation immédiate, paiement seul insuffisant).

## Modèle d'abonnement (implémenté, Phase 2)

- `Subscription` rattaché à un `SubscriptionOwner` polymorphe (`Tenant`, `FamilyAccount`, `Student` ou `Organization`) via des FK nullables + discriminant `ownerType` (Prisma ne supporte pas les FK polymorphes natives) — table séparée plutôt que des champs directs sur `Subscription`, pour que `BillingAccount` et `LicenseAssignment` référencent le même point d'ancrage sans dupliquer la logique polymorphe.
- Statuts (`DRAFT`…`REFUNDED`) et transitions tracées via `SubscriptionEvent` (immuable). Machine à états implémentée en Phase 3 (voir ci-dessous).
- Le lien parent-enfant (`ParentStudentRelationship`) est indépendant du paiement : il naît uniquement du parcours d'activation sécurisé (invitation → code d'activation à usage unique, haché, jamais stocké en clair → vérification → activation), jamais d'une simple déclaration ou d'un paiement — testé explicitement.
- Le tableau de bord parent consolidé interroge chaque tenant séparément avec le contexte de l'enfant concerné (voir `requireVerifiedStudentRelationship`) — jamais de jointure cross-tenant en base.

Schéma complet : `prisma/schema/*.prisma` (10 fichiers par domaine, 88 modèles).

## Abonnements et paiements (implémenté, Phase 3)

**Machine à états** ([subscription.service.ts](../apps/api/src/modules/subscriptions/subscription.service.ts) + [subscription-transitions.ts](../apps/api/src/modules/subscriptions/subscription-transitions.ts)) : table `ALLOWED_SUBSCRIPTION_TRANSITIONS` explicite (§6) — `CANCELLED`/`REFUNDED` terminaux, pas de saut direct `DRAFT` → `ACTIVE`. Chaque transition, dans une seule transaction : valide le changement, marque `startsAt`/`endsAt`/`cancelledAt` selon le cas, écrit un `SubscriptionEvent` immuable, recalcule les `Entitlement` depuis `PlanFeature` (activés seulement si le nouveau statut est `ACTIVE`/`TRIAL`/`GRACE_PERIOD` — jamais supprimés, juste désactivés, données préservées).

**Architecture adaptateur paiement** ([payment-providers/](../apps/api/src/modules/payments/payment-providers/)) : interface `PaymentProviderAdapter` (vérification de signature + parsing normalisé). Un seul flux est réellement opérationnel pour l'instant :

- **Espèces (`CASH_AGENT`)** : synchrone, pas de webhook — un agent autorisé enregistre le paiement, qui déclenche immédiatement facture payée + abonnement actif + reçu.
- **Mobile Money (Orange Money, MTN MoMo, M-Pesa, Airtel Money)** : **non branché** — aucun contrat opérateur ni identifiants sandbox à ce jour. `HmacSignedProviderAdapter` est un adaptateur de référence (HMAC-SHA256 sur le corps brut, schéma courant chez plusieurs opérateurs) servant de modèle et de banc de test — à dupliquer et ajuster contre la documentation réelle de chaque opérateur avant mise en production. `registry.ts` n'a donc aucun adaptateur réel enregistré par défaut : enregistrer un adaptateur y suffit pour activer un opérateur, sans toucher au reste du pipeline (§24).

**Webhook générique** (`POST /api/v1/payments/webhooks/:providerCode`) : monté avec un parseur de corps brut (`express.raw`) **avant** le `express.json()` global — la vérification de signature a besoin des octets exacts. Idempotence à deux niveaux : `PaymentWebhookEvent` unique par `(providerId, externalEventId)`, et `PaymentTransaction` unique par `(providerId, externalReference)` — une livraison dupliquée déclenche une contrainte unique, interceptée et traitée comme un no-op plutôt qu'une erreur.

**Chaîne facture → paiement** : `Invoice` (priorité tarifaire via `PlanPrice`, avec repli pays-spécifique → générique) → `PaymentIntent` (idempotent par `idempotencyKey`, fournie par le client ou générée) → `PaymentTransaction` → `handleSuccessfulTransaction` (marque la facture payée, active l'abonnement si transition valide, émet un reçu — le tout dans une seule transaction, idempotent si rejoué). Chaque étape appelée depuis les routes `/api/v1/subscriptions/school/*` revérifie que la ressource appartient bien au tenant de l'appelant (`assertInvoiceBelongsToSubscription`, `assertPaymentIntentBelongsToSubscription`) — jamais de confiance dans un id fourni par le client.

Tests (Phase 3, [apps/api/src/test/integration/](../apps/api/src/test/integration/) + tests unitaires co-localisés) : transitions valides/invalides, recalcul des entitlements (activation et expiration), flux espèces de bout en bout avec double appel idempotent, garde-fou cross-tenant sur le paiement, webhook signature valide/invalide/dupliquée.

**Hors périmètre Phase 3** : licences sponsorisées de bout en bout (`SponsoredLicense`/`LicenseBatch`/`LicenseAssignment` existent dans le schéma mais aucun service ne les pilote encore), codes promotionnels, abonnements parent/élève en libre-service (bloqués par l'absence d'authentification élève-via-`StudentUserLink`, voir Phase 5+), tarification par pays réelle (le seed n'a que des prix génériques XAF).

## Site public et inscription établissement (implémenté, Phase 4)

**Inscription établissement** ([tenant.service.ts](../apps/api/src/modules/tenants/tenant.service.ts), `POST /api/v1/tenants/onboarding`, authentifié mais sans tenant résolu — délibérément pas de `enforceTenantScope`, puisqu'aucun tenant n'existe encore) :

1. Valide pays/devise (référentiels seedés) et unicité du sous-domaine.
2. Crée `Tenant` + `TenantDomain` (statut `PENDING_VERIFICATION`, `verifiedAt` posé immédiatement — le parcours d'inscription lui-même constitue la vérification) dans une seule `rawPrisma.$transaction`.
3. Crée `TenantMembership` + `UserRole` (`SCHOOL_OWNER`) via `withTenantSession` (voir ci-dessus).
4. Crée optionnellement un abonnement `DRAFT` si un `planCode` est fourni.

Pas d'atomicité unique couvrant les étapes 2 et 3 (générer les ids à l'avance a été envisagé et écarté comme fragile) : en cas d'échec de l'étape 3, nettoyage compensatoire explicite (suppression du domaine puis du tenant) dans un `catch`.

**Site public** ([apps/web/src/pages/marketing/](../apps/web/src/pages/marketing/)) : accueil, tarifs (grille par catégorie — établissement/parent/élève, alimentée par les codes de plan seedés), contact (formulaire client uniquement, pas d'endpoint backend — voir Phase 10), pages légales (CGU/confidentialité/remboursement, bandeau « brouillon »), et l'assistant d'inscription multi-étapes (`SignupPage.tsx` : compte → établissement → formule → vérification → soumission `registerAccount` → `login` → `onboardTenant`). Bilingue via le namespace i18next `marketing` (fr par défaut, en secondaire — voir [packages/i18n/](../packages/i18n/)).

## Gestion de l'établissement (en cours, Phase 5)

Modules REST sous `enforceTenantScope + requireTenantMembership + requirePermission`, un router par domaine, montés dans [app.ts](../apps/api/src/app.ts) :

- **Configuration** ([school-config](../apps/api/src/modules/school-config/)) : campus, années/périodes académiques, cycles/niveaux, classes, départements/matières. Lecture ouverte à tout membre du tenant, écriture derrière `tenant.settings.manage`.
- **Utilisateurs** ([tenant-users](../apps/api/src/modules/tenant-users/)) : invitation (crée le `User` s'il n'existe pas encore, mot de passe aléatoire jamais communiqué — passe obligatoirement par reset, même TODO que `registerUser`), attribution/révocation de rôle, changement de statut de membership. Derrière `tenant.settings.manage`.
- **Personnel** ([employees](../apps/api/src/modules/employees/)) : fiche, statut, archivage (soft delete). `salaryCents` vit sur `EmploymentContract`, un modèle séparé jamais joint dans les listings — jamais exposé via ce module. Derrière `hr.manage`.
- **Élèves et inscriptions** ([students](../apps/api/src/modules/students/)) : fiche élève (matricule unique par tenant), statut, archivage ; inscription/réinscription (`Enrollment`, une ligne par élève et par année scolaire, `withTenantSession` pour l'écriture combinée inscription + passage `PROSPECTIVE → ACTIVE`). `medicalNotes` accepté en écriture mais jamais renvoyé par l'API générale (`omit` Prisma) — pas encore d'endpoint dédié infirmerie/direction pour le relire (§19). Lecture derrière `students.read` (dont `TEACHER`), écriture derrière `students.write` (`SCHOOL_OWNER`/`SCHOOL_ADMIN`).
- **Documents justificatifs** (`StudentDocument`, dans le même module `students`) : métadonnées uniquement (catégorie + URL fournie par le client, déjà uploadée ailleurs — l'API ne gère aucun octet de fichier), `uploadedByUserId` résolu depuis le token d'auth (jamais depuis le corps de la requête), suppression douce. Mêmes permissions que le reste du module.
- **Détection de doublons** (toujours dans `students`) : heuristique non bloquante — même nom de famille et (prénom identique OU date de naissance identique), insensible à la casse, au sein du même tenant. Renvoyée automatiquement dans `possibleDuplicates` à la création d'un élève, et interrogeable à l'avance via `GET /students/check-duplicates?firstName=&lastName=&dateOfBirth=`. Le volet « configurable » du §19 (activer/désactiver par tenant, ajuster les critères) est différé : il suppose une brique de paramètres tenant (`TenantSetting`) qui n'a pas encore de service ni d'API pour la piloter.
- **Transferts inter-établissements** ([transfer.routes.ts](../apps/api/src/modules/students/transfer.routes.ts), routeur de premier niveau `/api/v1/student-transfers` — pas nested sous `/students`, car le tenant destinataire n'a par définition pas accès au `Student` du tenant source) : workflow en 4 actions sur les 4 statuts de `StudentTransfer` (`REQUESTED → APPROVED/REJECTED → COMPLETED`) — la source demande (destinataire résolu par sous-domaine, jamais par id brut, §8) avec un `dataScope` explicite des champs sensibles autorisés à transiter (jamais un défaut « tout copier », §10) ; le destinataire approuve ou rejette ; la source, une fois approuvé, exécute (`complete`) : crée la fiche chez le destinataire avec un matricule neuf obligatoire et uniquement les champs du `dataScope`, marque l'élève source `TRANSFERRED`. `StudentTransfer` a `fromTenantId`/`toTenantId` plutôt qu'un `tenantId` unique, donc **hors** de la liste auto-scopée par l'extension Prisma (`tenant-scoped-models.ts`) — le service filtre chaque requête explicitement via `rawPrisma`, et toute discordance de partie répond `404` (jamais `403`, même convention que le garde-fou d'extension pour ne jamais confirmer l'existence d'une ressource à qui n'y a pas droit). Les deux écritures de `complete` (création chez le destinataire, mise à jour chez la source) tournent dans deux `withTenantSession` séparés — non atomique à travers la frontière tenant, un choix assumé (voir commentaire dans `transfer.service.ts`).

Restent hors périmètre de cette tranche : rattachement parent/élève par invitation + code d'activation (§8 — explicitement Phase 8), import/export CSV/Excel, génération de cartes scolaires.

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
- **Phase 3 — Abonnements** : terminée pour le flux établissement (machine à états, factures, paiement espèces de bout en bout, architecture webhook générique et idempotente). Restent hors périmètre : intégration Mobile Money réelle (aucun contrat opérateur signé), licences sponsorisées pilotées par un service, codes promotionnels, abonnements parent/élève en libre-service, tarification multi-pays réelle.
- **Phase 4 — Site public** : terminée (accueil, tarifs, contact, pages légales, assistant d'inscription établissement de bout en bout, vérifié en conditions réelles contre l'API). Restent hors périmètre : endpoint backend pour le formulaire de contact, connexion effective à l'espace créé (le portail établissement lui-même est Phase 5).
- **Phase 5 — Gestion de l'établissement** : en cours. Terminé : configuration, utilisateurs, personnel, élèves et inscriptions, documents justificatifs, détection de doublons, transferts inter-établissements (voir section dédiée ci-dessus). Restent : rattachement parent/élève (renvoyé à la Phase 8), import/export CSV/Excel, cartes scolaires.
- Phases 6 à 11 : selon le plan validé, non commencées.

## Notes d'environnement de développement

- pnpm n'a pas pu être activé globalement sur cette machine (droits administrateur requis pour écrire dans `C:\Program Files\nodejs`). Shim installé dans `C:\Users\PC\bin` (déjà dans le PATH) ; `pnpm` fonctionne normalement dans ce terminal.
- Postgres tourne nativement sur cette machine (pas Docker — Docker Desktop n'a pas pu être démarré). Bases `edumanage_dev` et `edumanage_test`, utilisateur superuser `postgres`.
- Rôle applicatif `edumanage_app` créé manuellement (hors migration versionnée, car création de rôle + mot de passe ne doit jamais être dans un fichier commité) : privilèges DML uniquement sur les deux bases, sans `BYPASSRLS`. Identifiants dans `apps/api/.env` / `apps/worker/.env` (gitignorés). Un environnement de production devra recréer ce rôle avec son propre mot de passe via le secrets manager de l'hébergeur (Coolify), jamais en réutilisant celui du dev.
- `docker/docker-compose.yml` reste la référence pour un environnement Docker standard ; non utilisé sur cette machine faute de daemon disponible.
