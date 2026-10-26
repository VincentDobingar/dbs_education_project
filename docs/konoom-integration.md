# Intégration Konoom (Tchad, Cameroun)

Konoom est un établissement de paiement agréé par la COBAC : Konoom au Tchad depuis 2025, et KONOOM CAMEROUN S.A. au Cameroun (arrêté n°681/MINFI du 21 juillet 2026, décision COBAC D-2026/092). Ses services couvrent le portefeuille électronique (application, web, USSD, WhatsApp), le paiement marchand par QR, le paiement de factures et les paiements de masse.

Konoom ne publie pas de documentation d'API. Ce document décrit le **contrat d'intégration proposé** dans le cadre du partenariat, tel qu'il est déjà implémenté côté EduManage Africa. À la signature, il suffit d'aligner les noms de champs de `KonoomPaymentAdapter` sur la documentation fournie par Konoom ; le reste du circuit ne change pas.

## Où Konoom intervient

| Flux                              | Payeur          | Bénéficiaire                    | Statut                        |
| --------------------------------- | --------------- | ------------------------------- | ----------------------------- |
| Cours de renforcement             | Parent ou élève | Enseignant, établissement, DBSA | Branché, en attente des clés  |
| Abonnement établissement (SaaS)   | Établissement   | DBSA                            | Prévu (même adaptateur)       |
| Abonnement famille / élève        | Parent ou élève | DBSA                            | Prévu (même adaptateur)       |
| Frais de scolarité                | Parent          | Établissement                   | Prévu (phase 2)               |
| Reversements (paiements de masse) | DBSA            | Enseignants, établissements     | Manuel aujourd'hui, API visée |

## Code

| Élément                                                              | Rôle                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/api/src/modules/payments/payment-providers/konoom-provider.ts` | Adaptateur : demande d'encaissement, signature et lecture du webhook  |
| `apps/api/src/lib/payment-channels.ts`                               | Branche `KONOOM_TD` et `KONOOM_CM` quand les 4 variables existent     |
| `prisma/seed/data/payment-providers.ts`                              | Opérateurs `KONOOM_TD` (Tchad) et `KONOOM_CM` (Cameroun), type WALLET |
| `POST /api/v1/payments/webhooks/KONOOM_TD` (ou `KONOOM_CM`)          | Webhook générique, idempotent, déjà en production                     |

Variables du service api : `KONOOM_API_BASE_URL`, `KONOOM_API_KEY`, `KONOOM_MERCHANT_ID`, `KONOOM_WEBHOOK_SECRET`. Sans elles, aucun moyen Konoom n'est proposé et le reste de la plateforme fonctionne normalement.

## Séquence d'un paiement

1. Le parent choisit Konoom et saisit le numéro de son portefeuille.
2. L'API crée une intention de paiement (`PaymentIntent`, référence unique) puis appelle Konoom :
   `POST {KONOOM_API_BASE_URL}/v1/collections` avec `Authorization: Bearer <clé>` et l'en-tête `Idempotency-Key`.

   ```json
   {
     "merchant_id": "DBSA-001",
     "reference": "RC-MH4K2P-AB12-7F3C21",
     "amount": 15000,
     "currency": "XAF",
     "msisdn": "+23566000000",
     "description": "Cours de renforcement RC-MH4K2P-AB12 — Préparation au BEPC",
     "callback_url": "https://api…/api/v1/payments/webhooks/KONOOM_TD"
   }
   ```

3. Konoom envoie une demande de validation au portefeuille du payeur (notification, USSD).
4. Konoom appelle le webhook, signé en HMAC-SHA256 du corps brut avec le secret partagé (en-tête `X-Konoom-Signature`, hexadécimal, préfixe `sha256=` accepté) :

   ```json
   {
     "event_id": "evt_…",
     "transaction_id": "KNM-…",
     "reference": "RC-…",
     "status": "SUCCESS",
     "amount": 15000
   }
   ```

5. La plateforme vérifie la signature, enregistre l'événement une seule fois (idempotence par `event_id` et par `transaction_id`), confirme l'inscription, crée le reçu et les lignes de reversement — dans une seule transaction.

Statuts reconnus : `SUCCESS`/`SUCCEEDED`/`COMPLETED` → payé ; `FAILED`/`EXPIRED` → échec ; `CANCELLED` → annulé.

## Points à confirmer avec Konoom

- Noms exacts des routes, champs et en-tête de signature (l'adaptateur s'aligne en quelques lignes).
- Environnement de test (sandbox) et numéros de test.
- Frais d'encaissement par transaction, et qui les supporte.
- API de paiement de masse pour automatiser les reversements aux enseignants et aux établissements.
- Interopérabilité : paiement depuis Airtel Money ou Moov Africa vers un marchand Konoom.
- Délai de règlement des fonds encaissés vers le compte marchand DBSA.
