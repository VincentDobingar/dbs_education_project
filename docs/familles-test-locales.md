# Parcours de test local

Les six élèves disposent désormais de dix notes, emplois du temps, devoirs, cours en ligne et annonces de démonstration. Voir `dashboard-eleve-complet.md` pour le jeu pédagogique et le nouveau bulletin premium.

## État actuel : licences activées pour tous les tests

À la demande de l'utilisateur, `pnpm db:seed:activate-test-portals` a activé les licences locales parents/élèves : **11 abonnements actifs, 7 relations parent-enfant couvertes et 7 dossiers élèves**. Les parents utilisent la formule familiale, les élèves la formule Premium ; les droits PDF sont matérialisés et la validité de test est d'un an, sans prélèvement automatique ni paiement réel.

Le compte `parent.sansabonnement@example.test` est donc désormais lui aussi abonné pour les essais. Les descriptions de refus sans abonnement ci-dessous correspondent au scénario initial avant cette activation générale.

Ce script refuse toute base autre qu'une base `_dev` sur localhost. Il ne crée aucun utilisateur, mot de passe ou rattachement de compte élève. Les six comptes décrits ci-dessous ont ensuite été créés séparément à la demande explicite de l'utilisateur. Les contrôles de parenté, de rattachement et d'isolation des établissements restent actifs. L'activation et les changements de formule sont tracés. Une seconde exécution conserve les mêmes nombres de dossiers et de couvertures.

## Comptes élèves

`pnpm db:seed:test-student-accounts`, avec `TEST_STUDENT_PASSWORD` fourni à l'exécution, crée les six comptes et les lie aux dossiers de démonstration. Les mots de passe sont hachés avec Argon2id. Le script est limité à la base locale `_dev`, conserve les comptes déjà liés et refuse de récupérer un email ou un dossier déjà affecté à une autre identité. Il n'envoie aucune notification et ne confère aucun droit d'administration d'établissement.

| Établissement | Élève | Identifiant |
|---|---|---|
| AuriGeo | Sara | eleve.aurigeo.1@example.test |
| AuriGeo | Adam | eleve.aurigeo.2@example.test |
| AuriGeo | Luc | eleve.aurigeo.3@example.test |
| Ecole de la vie | Sara | eleve.ecolevie.1@example.test |
| Ecole de la vie | Adam | eleve.ecolevie.2@example.test |
| Ecole de la vie | Luc | eleve.ecolevie.3@example.test |

Connexion via `/portail/connexion`, puis redirection automatique vers `/portail/eleve`. Les licences Premium précédemment activées débloquent les fonctions protégées. Vérification locale pour chacun des six comptes : un seul rattachement, dashboard, deux notes publiées, cinq pointages de présence, un bulletin et PDF HTTP 200. Les notes non publiées restent cachées ; les nouvelles routes de notes et présences vérifient le rattachement et l'abonnement actif.

Le script `pnpm db:seed:test-families` exige les variables d'environnement `TEST_ADMIN_PASSWORD` et `TEST_PARENT_PASSWORD`. Les mots de passe ne sont pas inscrits dans le script. Il refuse une base distante et traite tout le jeu dans une transaction. Il se relance sans dupliquer les dossiers ; le mot de passe administrateur est alors réinitialisé à la valeur fournie. Les comptes parents existants gardent leur mot de passe.

Établissements : **AuriGeo** (`aurigeo`) et **Ecole de la vie** (`ecolevie`). Chacun reçoit Sara et Adam Test-Famille, ainsi que Luc Test-SansAbonnement, matricules `LOCAL-PARCOURS-1` à `LOCAL-PARCOURS-3`. Ils sont rattachés aux trois premières classes disponibles de l'année marquée courante (2026-2027 lors de l'insertion).

Chaque élève a un seul parent principal, une inscription et trois factures de test non réglées de 10 000 unités chacune. La période d'inscription `LOCAL-PARCOURS` est ouverte. Aucune note ni présence fictive n'est ajoutée.

- `parent.famille@example.test` : profil global Amina Test-Famille, deux enfants dans chaque établissement. Un abonnement familial fictif par établissement couvre les deux enfants correspondants.
- `parent.sansabonnement@example.test` : profil global Paul Test-SansAbonnement, un enfant par établissement et aucun abonnement ; dashboard sans données scolaires.
- `dobingar.vincent@dbs-africa.org` : SUPER_ADMIN global et SCHOOL_ADMIN des deux établissements. Connexion plateforme `/admin/connexion`, connexion établissement `/connexion`.

Les profils centraux sont liés aux contacts administratifs des deux établissements : une modification du profil parent doit donc se refléter des deux côtés. Les liens VERIFIED et invitations USED sont des fixtures synthétiques créées directement pour ce test local, pas des invitations réellement envoyées ou validées. Les abonnements actifs sont également fictifs, tracés comme tels par des événements et sans encaissement. Un abonnement établissement de test est ajouté seulement si aucun abonnement actif non expiré n'existe, afin de rendre la gestion scolaire accessible.

Validation effectuée via l'API locale : connexion des trois comptes, accès aux élèves des deux établissements, quatre enfants visibles pour le parent abonné et zéro pour le parent sans abonnement. Script exécuté deux fois et vérification TypeScript réussie.

## Notes, présences et paiements

`pnpm db:seed:test-follow-up` complète les six dossiers `LOCAL-PARCOURS` : deux notes sur 20 (français et mathématiques), un bulletin avec coefficients du niveau, cinq pointages (présence, absence, absence justifiée, retard, présence), deux paiements en espèces fictifs et leurs reçus par élève. Un agent de caisse de test est lié au compte administrateur dans chaque établissement.

La première tranche de 10 000 unités est entièrement réglée ; la deuxième reçoit 5 000 unités ; la troisième reste impayée. Total par enfant : 30 000 facturés, 15 000 réglés, 15 000 restant dus. Les paiements sont tracés dans l'audit comme données locales de test et n'appellent aucun prestataire bancaire.

Le script fonctionne uniquement sur une base locale, dans une transaction. Les identifiants stables évitent les doublons ; les notes et bulletins déjà présents sont conservés. Une facture déjà réglée manuellement est ignorée pour ne pas écraser son historique. Les rangs de classe restent absents plutôt que de classer des élèves réels à partir de notes partielles de démonstration.
