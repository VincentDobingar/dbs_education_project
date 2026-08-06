# Architecture — EduManage Africa

Ce document résume les décisions validées lors de la Phase 0 (analyse). Le cahier des charges complet reste [prompt_dbs_edu_africa.txt](../prompt_dbs_edu_africa.txt) ; ce fichier documente ce qui a été _décidé_, pas ce qui est _souhaité_.

## Décisions validées

| Sujet                    | Décision                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multitenance             | Base/schéma PostgreSQL partagés + colonne `tenantId` sur chaque table métier + Row-Level Security Postgres + extension Prisma qui applique le filtre tenant automatiquement. Jamais de `tenant_id` accepté depuis le client.                                                              |
| Résolution du tenant     | Sous-domaine (`TenantDomain`) + membership vérifié de l'utilisateur authentifié. Jamais un paramètre libre de requête.                                                                                                                                                                    |
| Monorepo                 | pnpm workspaces + Turborepo                                                                                                                                                                                                                                                               |
| Paiements — priorité MVP | Afrique centrale (zone CEMAC : Orange Money, MTN MoMo, Airtel Money) et Afrique de l'Est (M-Pesa, MTN MoMo, Airtel Money) en premier ; UEMOA et autres zones ensuite. Architecture par adaptateurs (`PaymentProvider`) dès la Phase 3 pour ne pas bloquer l'ajout ultérieur d'opérateurs. |
| Hébergement production   | Coolify auto-hébergé sur VPS (panneau graphique gratuit orienté Docker/Node/Postgres/Redis, alternative à cPanel qui ne convient pas à cette stack)                                                                                                                                       |
| Portée MVP               | Cœur uniquement : académique + finance + abonnements + portails. Aucun module complémentaire (bibliothèque, transport, cantine, internat, e-learning) au MVP — Phase 10.                                                                                                                  |
| Auth                     | Argon2id pour les mots de passe, access token courte durée + refresh token rotatif en cookie httpOnly                                                                                                                                                                                     |

## Stratégie multitenant (détail)

Trois couches de défense, aucune ne suffisant seule :

1. **Colonne `tenantId`** obligatoire, indexée, sur chaque table tenant-scopée.
2. **Row-Level Security PostgreSQL** : policy comparant `tenantId` à `current_setting('app.current_tenant')`, positionné par connexion à chaque requête.
3. **Prisma Client Extension** injectant/validant `tenantId` sur chaque requête des modèles tenant-scopés.

Le contexte tenant est résolu une seule fois par requête, dans un middleware `enforceTenantScope`, à partir du sous-domaine et du membership vérifié de l'utilisateur — jamais fourni librement par le frontend.

Tests obligatoires (Phase 2) : matrice multi-tenant démontrant qu'aucune route ne laisse fuir les données d'un tenant vers un autre (lecture, écriture, suppression, recherche).

## Modèle d'abonnement (résumé)

- `Subscription` rattaché à un propriétaire polymorphe (`Tenant`, `FamilyAccount`, `Student` ou organisation sponsor) via des FK nullables + discriminant `ownerType` (Prisma ne supporte pas les FK polymorphes natives).
- Statuts gérés par une machine à états explicite (`SubscriptionService.transition()`), chaque transition auditée via `SubscriptionEvent`.
- Le lien parent-enfant (`ParentStudentRelationship`) est indépendant du paiement : il naît uniquement du parcours d'activation sécurisé (invitation → code d'activation à usage unique → vérification → activation), jamais d'une simple déclaration ou d'un paiement.
- Le tableau de bord parent consolidé interroge chaque tenant séparément avec le contexte de l'enfant concerné — jamais de jointure cross-tenant en base.

Détail complet des ~80 entités du modèle de données : Phase 2.

## Chaîne d'autorisation backend

```
requireAuth
  → requirePlatformRole        (routes super-admin)
  → enforceTenantScope         (résout et verrouille le tenant de la requête)
  → requireTenantMembership
  → requirePermission(permission)
  → requireVerifiedStudentRelationship  (routes ciblant un élève, cas parent)
  → requireActiveSubscription(ownerType)
  → requireEntitlement(feature)
```

Chaque middleware est testable isolément. Aucun contrôleur ne fait sa propre vérification d'autorisation.

## Phases de développement

Voir §38 du cahier des charges pour le détail complet. État actuel : **Phase 1 — Fondation** (monorepo, squelettes apps/packages, Docker Compose dev, qualité, CI). Phases suivantes : Phase 2 (schéma Prisma complet, auth, RBAC, isolation multitenant testée), Phase 3 (abonnements/paiements), puis Phases 4 à 11 selon le plan validé.

## Notes d'environnement de développement

- pnpm n'a pas pu être activé globalement sur cette machine (droits administrateur requis pour écrire dans `C:\Program Files\nodejs`). Utiliser `corepack pnpm <commande>` en attendant, ou activer pnpm dans un terminal élevé.
- Le schéma Prisma (`prisma/schema.prisma`) ne contient encore que le `datasource`/`generator` — les modèles arrivent en Phase 2.
