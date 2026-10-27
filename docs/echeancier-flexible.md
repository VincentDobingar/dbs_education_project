# Inscription et échéancier flexibles

Les établissements facturent d'abord des **frais d'inscription**, puis la **scolarité par tranches** (2 à 4, parfois des mensualités), calées sur leur calendrier : trimestres dans le privé, semestres dans le public. Ce module remplace l'ancien échéancier unique des périodes d'inscription (1 à 3 montants identiques pour tous les niveaux), qui reste utilisé tant qu'aucun plan n'est défini pour l'année.

## Paramétrage (menu « Frais et échéanciers »)

| Brique            | Table                               | Rôle                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rubrique          | `FeeCategory.nature`                | `REGISTRATION` (payée à l'inscription), `TUITION` (découpée par le plan), `ANNEX` et `EXAM` (facturées avec une tranche) ; `isRefundable` (inscription non remboursable par défaut)                                                                      |
| Tarif             | `FeeStructure`                      | montant par rubrique, niveau (`gradeLevelId`), filière (`programId`), profil `studentType` (ALL/NEW/RETURNING), facultatif ou non, `dueWithInstallment` pour annexes et examens. Le tarif le plus précis gagne.                                          |
| Plan d'échéances  | `FeePlan`, `FeePlanInstallment`     | 1 à 12 tranches ; part en points de base (total 10 000) ; échéance = début d'une période scolaire + décalage, date fixe, ou jour de l'inscription. Un plan par cycle prime sur le plan général (cycle nul) ; un seul plan par année et par cycle.        |
| Remise prédéfinie | `FeeDiscountPreset`                 | pourcentage ou montant, appliqué à la scolarité                                                                                                                                                                                                          |
| Politique         | `TenantSetting` `finance.feePolicy` | inscription en cours d'année (GROUP / PRORATA), réinscription avec arriérés (ALLOW / BLOCK), relances, pénalités, retenue de bulletin, paiement en ligne. Valeurs par défaut prudentes : rien ne pénalise l'élève tant que la direction ne l'active pas. |

« Dupliquer sur cette année » reprend tarifs et plans d'une autre année (tranches rattachées à la période de même rang, dates fixes décalées d'un an).

## Inscription

`POST /students/:id/enrollments/preview` calcule l'échéancier sans rien écrire ; `POST /students/:id/enrollments` accepte en plus `optionalFeeStructureIds`, `discountPresetIds` et `manualDiscounts` (remise au cas par cas, motif obligatoire, permission `finance.exceptions`).

À l'inscription :

- un **contrat** `StudentFeeAgreement` fige les lignes, montants, remises (`StudentFeeDiscount`) et le plan ; un changement de tarif ultérieur ne le modifie pas ;
- une facture par échéance (`StudentInvoice.kind` = `REGISTRATION` ou `INSTALLMENT`, `installmentSequence`, `agreementId`) ;
- s'il y a des frais d'inscription, l'inscription est **`ADMITTED`** : l'élève n'apparaît dans aucune liste de classe tant que l'échéance d'inscription n'est pas soldée. Le paiement la fait passer à `ENROLLED` (ou `RE_ENROLLED`) et le dossier `PROSPECTIVE` devient `ACTIVE` (`activateEnrollmentIfRegistrationPaid`, appelé par tous les chemins d'encaissement).

Calcul (`modules/finance/fee-schedule/engine.ts`, fonctions pures testées) : remises sur la scolarité seulement, découpage par parts avec la dernière tranche qui absorbe les arrondis, annexes et examens sur leur tranche, tranches échues regroupées (GROUP) ou non facturées (PRORATA) pour une arrivée en cours d'année.

## Caisse

`POST /finance/students/:id/payments` (`{ amountCents, invoiceId? }`) : le versement solde **l'inscription d'abord, puis les échéances de la plus ancienne à la plus récente** (arriérés et pénalités compris) ; un `StudentPayment` et un reçu par échéance touchée, liés par `allocationGroupId` ; le trop-perçu devient un avoir (`StudentCredit`, réglé par la méthode `CREDIT` dès qu'une nouvelle échéance apparaît). Reçu détaillé : `GET /finance/payment-groups/:groupId/pdf` (ligne par ligne, reste dû, prochaine échéance).

Échéancier individuel (permission `finance.exceptions`, audit avec motif) : `POST /finance/student-invoices/:id/reschedule` (report) et `/split` (découpage d'une échéance non entamée, somme inchangée).

Retrait ou transfert : les échéances futures non entamées sont annulées, l'inscription payée n'est pas remboursée ; un élève admis qui part avant d'avoir payé n'a plus rien à payer.

## Relances, pénalités, retenue de bulletin

Tâche horaire dans l'API (`startFeeScheduler`, verrou Redis, `FEE_SCHEDULER_ENABLED=false` pour la couper) : rappels J-3 / J+1 / J+15 par défaut (portail, e-mail, SMS au tuteur principal), une seule fois par échéance et par type (`FeeReminderLog`), pénalité unique par échéance si activée (`StudentInvoice.kind = PENALTY`, `penaltyForInvoiceId` unique). Le statut « en retard » reste calculé à la volée.

Retenue du bulletin (option) : les portails parent et élève répondent `403 REPORT_CARD_WITHHELD` sur le détail et le PDF d'un bulletin quand une échéance est en retard depuis plus de N jours. L'établissement garde l'accès.

## Portail parent et paiement en ligne

`GET /parent-portal/children/:id/fee-schedule` : échéancier, prochaine échéance, avoir, retenue. Si l'établissement active le paiement en ligne, `POST …/fee-schedule/:invoiceId/pay` crée une intention `STUDENT_FEE` (avec `tenantId`) et sollicite l'opérateur (Konoom) ; le webhook générique solde l'échéance dans la même transaction. Les frais scolaires sont tenus en centièmes de FCFA : conversion vers les unités de la devise (`studentCentsToMinorUnits`). Les montants encaissés par DBSA sont suivis par établissement : `GET /platform/fee-settlements`, `POST /platform/fee-settlements/:tenantId/mark-paid` (page SuperAdmin « Reversements frais scolaires »).

## Tableau de recouvrement

`GET /finance/recovery?academicYearId=` : taux par tranche et par classe, retards, élèves en retard, encaissements attendus à 30 jours, admis en attente d'inscription.

## Migration

`20261027120000_flexible_fee_plans` : ajouts de colonnes et de tables sous RLS, valeur `CREDIT` dans `PaymentMethodType`, l'échéancier d'une période d'inscription devient facultatif (0 à 3 tranches, refusé à 0 tant que l'année n'a pas de plan). Les factures `INS-…` existantes sont marquées `INSTALLMENT` ; aucun montant n'est modifié.
