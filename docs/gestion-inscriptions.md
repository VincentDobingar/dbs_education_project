# Élèves, tuteurs principaux et inscriptions

## Parcours de l'établissement

1. Dans **Configuration**, créer l'année académique et les classes (campus et niveau compris).
2. Dans **Parents / tuteurs**, enregistrer les coordonnées du responsable. Il peut être sélectionné pour plusieurs enfants.
3. Dans **Élèves**, créer le dossier en sélectionnant son tuteur principal. Pour les dossiers existants, utiliser le rattachement dans la fiche élève.
4. Dans **Inscriptions**, sélectionner l'année et créer une période d'inscription avec ses dates d'ouverture et de clôture. Si l'année a un plan d'échéances (menu **Frais et échéanciers**, voir `echeancier-flexible.md`), les montants viennent de la grille et du plan ; sinon, définir de une à trois tranches sur la période.
5. Sélectionner une période ouverte, l'élève et une classe de l'année correspondante. La confirmation crée atomiquement l'inscription et une facture émise par tranche. Les encaissements utilisent ensuite la facturation existante dans la fiche élève.

## Règles et protection des données

- La contrainte unique `(studentId, academicYearId)` interdit deux inscriptions d'un élève pour la même année, même dans des périodes ou classes différentes. Le verrouillage transactionnel empêche aussi deux jeux de factures lors de requêtes simultanées.
- L'année de la période doit être celle de la classe ; le campus et le niveau doivent correspondre à la classe. Une clé étrangère composite renforce le lien établissement/année/période en base.
- Le tuteur principal est une référence unique sur le dossier élève, dont la clé étrangère impose le même établissement. Le remplacer ne crée pas de deuxième responsable principal.
- `SchoolGuardian` est un contact administratif propre à l'établissement, distinct du modèle global `Guardian` utilisé par les comptes familiaux. Le rattachement ne crée ni compte utilisateur, ni droit d'accès au portail. Les invitations et leur activation sécurisée restent nécessaires.
- Les nouvelles tables `SchoolGuardian` et `RegistrationPeriod` sont protégées par le garde Prisma et par RLS PostgreSQL.
- Les montants sont stockés en centimes ; les échéances sont ordonnées ; l'échéancier accepte de une à trois tranches. Les tarifs d'une période sont immuables dans l'API : fermer la période et en créer une autre pour modifier les conditions des prochaines inscriptions. Les factures déjà créées conservent leurs montants et échéances.
- La première inscription est `ENROLLED` ; une inscription pour une autre année après une inscription existante est `RE_ENROLLED`.

## Reprise des données existantes

La migration ajoute les structures sans attribuer de parents, classes, années ou tarifs fictifs aux dossiers existants. Les anciens dossiers incomplets sont signalés dans les listes. Les références restent nullables en base pour cette reprise et pour les dossiers préparatoires/importés non inscrits ; toute **nouvelle inscription par l'API** exige une période et un tuteur principal valides. Les anciens exports/imports restent compatibles ; l'import CSV accepte en plus `primaryGuardianId` pour rattacher un tuteur déjà enregistré dans l'établissement.

Aucune facture rétroactive n'est créée par la migration. Aucune donnée de production n'est modifiée automatiquement par le déploiement du code au-delà des ajouts de schéma.

## Routes

- `GET/POST /api/v1/registrations/guardians`, `PATCH /api/v1/registrations/guardians/:id`
- `GET/POST /api/v1/registrations/periods`, `PATCH /api/v1/registrations/periods/:id` pour ouvrir/fermer
- `GET /api/v1/registrations/enrollments?academicYearId=…&registrationPeriodId=…`
- `POST /api/v1/students/:studentId/enrollments` exige désormais `registrationPeriodId`, en plus des références académiques existantes.

Les lectures exigent `students.read`, les écritures `students.write`, avec authentification, appartenance à l'établissement et abonnement actif.
