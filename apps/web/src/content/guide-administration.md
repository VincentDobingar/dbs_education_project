Ce guide complète le [guide d'utilisation](/guide) public : il couvre les tâches réservées à l'équipe DBS Africa. L'espace d'administration s'ouvre depuis [/admin/connexion](/admin/connexion), avec un compte ayant un rôle plateforme.

## Super-administration

L'espace /admin sert à valider les établissements, ouvrir leurs abonnements et tenir les listes de référence. Toute action sensible demande une justification, conservée dans les journaux d'audit.

### Valider un nouvel établissement

1. **Établissements** : rechercher l'établissement (statut « En attente de vérification »), saisir une justification, cliquer sur **Vérifier** (ou **Rejeter**).
2. **Abonnements** : repérer sa demande (statut Brouillon), saisir une justification, puis **Démarrer l'essai gratuit** (30 jours) ou **Activer l'abonnement** après paiement.
3. L'établissement accède immédiatement à tous ses modules.

Sur la même page : **Prolonger l'essai**, **Forcer la transition** vers un autre statut, **Purger les abonnements expirés**, et l'historique des transitions de chaque abonnement. Un établissement peut aussi être **Suspendu** puis **Réactivé**, et recevoir une élévation temporaire (72 h maximum) pour une intervention de support.

### Tenir le catalogue des listes de choix

**Données de référence → Catalogue établissements** gère les listes proposées en Configuration : cycles, niveaux, matières, types d'évaluation, catégories de frais, campus, salles et jours fériés par pays. On peut ajouter, **Modifier**, **Désactiver** ou **Réactiver** un élément. Désactiver le retire des listes sans toucher aux établissements qui l'ont déjà ajouté. Les autres onglets gèrent les pays, les devises et les moyens de paiement.

### Gérer les comptes des établissements

Les établissements ne gèrent plus leurs comptes : tout passe par **Utilisateurs**.

1. Choisir l'établissement. La justification est préremplie ; la modifier si besoin.
2. **Ajouter une personne** : e-mail, prénom, nom (requis pour une nouvelle adresse) et rôle. Laisser cochée « Envoyer le lien d'accès par e-mail » : la personne choisit elle-même son mot de passe.
3. Dans la liste : attribuer ou retirer un rôle, suspendre ou retirer l'accès, **Renvoyer le lien d'accès** si le premier a expiré (30 minutes).

Chaque action est enregistrée dans les **Journaux d'audit**.

### Autres pages

| Page                | Usage                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tableau de bord     | Établissements et abonnements par statut, revenus et paiements échoués sur 30 jours, conversion essai → payant, résiliation |
| Journaux d'audit    | Qui a fait quoi, quand et pourquoi ; filtres par établissement, entité ou acteur                                            |
| Codes promo         | Réduction en pourcentage ou montant fixe, nombre d'utilisations maximum                                                     |
| Support             | Tickets de tous les établissements : assigner, répondre, note interne                                                       |
| Modèles de messages | Gabarits de notification globaux ou par établissement, en français et en anglais                                            |
| Sponsors            | Organisations sponsors (ONG, entreprises, gouvernements), lots de licences, attribution aux parents ou élèves               |
| Paramètres          | Paramètres globaux de la plateforme (clé / valeur)                                                                          |

## Données de démonstration

AuriGeo School contient un jeu de démonstration complet, du CP1 à la Terminale, pour présenter la plateforme ou s'entraîner. Les données ne s'affichent qu'une fois l'abonnement d'AuriGeo en essai ou actif.

| Contenu                 | Quantité                                                            | Repérage                                 |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Année scolaire          | 2026-2027 (1er octobre au 30 juin)                                  | Créée seulement si aucune n'existait     |
| Classes                 | 13 : CP1 A à CM2 A, 6e A à 3e A, Seconde C, Première D, Terminale D | Une classe par niveau                    |
| Élèves                  | 100, de 6 à 7 élèves par classe au lycée et 8 ailleurs              | Matricules DEMO-2026-001 à DEMO-2026-100 |
| Enseignants             | 19, chacun affecté à ses matières et classes (110 affectations)     | Matricules DEMO-ENS-001 et suivants      |
| Personnel administratif | 5                                                                   | Matricules DEMO-ADM-001 et suivants      |
| Emplois du temps        | 13 (un par classe), 328 cours par semaine, du lundi au vendredi     | Nom se terminant par « (démo) »          |

Pour la même chose sur un autre établissement, un développeur lance `pnpm db:seed:demo --tenant=<sous-domaine>` (ajouter `--dry-run` pour vérifier sans rien écrire). `--cleanup` retire uniquement les données marquées DEMO, sans toucher au reste.

### Établissement et comptes de test

La variable `SEED_TEST_ACCOUNTS_EMAIL` du service api (Railway), par exemple `prenom.nom@gmail.com`, crée au déploiement suivant, une seule fois, **Collège Horizon de Moundou** (identifiant `college-horizon`, données de démonstration incluses, abonnement Professionnel actif) et quatre comptes sur des alias de cette adresse :

| Compte     | Adresse                   | Espace                                     |
| ---------- | ------------------------- | ------------------------------------------ |
| Direction  | `prenom.nom+directeur@…`  | Espace établissement (propriétaire)        |
| Enseignant | `prenom.nom+enseignant@…` | Espace établissement (lié à une fiche ENS) |
| Élève      | `prenom.nom+eleve@…`      | Portail famille (élève de 3e A, abonné)    |
| Parent     | `prenom.nom+parent@…`     | Portail famille (parent vérifié, abonné)   |

Aucun mot de passe n'est défini : chaque compte choisit le sien avec **Mot de passe oublié ?**. L'établissement apparaît dans le carrousel de l'accueil ; décocher « Afficher mon établissement sur la page d'accueil » dans sa Configuration pour l'en retirer.

## Dépannage

| Message ou symptôme                              | Cause                                                       | Que faire                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| « Ce compte n'a aucun rôle plateforme »          | Connexion à l'administration avec un compte d'établissement | Utiliser la connexion établissement, ou attribuer un rôle plateforme au compte                                                          |
| Un établissement voit « pas d'abonnement actif » | Sa demande est encore en Brouillon                          | **Abonnements** : saisir une justification puis **Démarrer l'essai gratuit** ou **Activer l'abonnement**                                |
| Une liste de choix manque d'un élément           | Absent du catalogue                                         | **Données de référence → Catalogue établissements** : ajouter l'élément ; il apparaît aussitôt dans la Configuration des établissements |
| Un compte doit être lié à sa fiche employé       | La liaison ne se fait pas encore à l'écran                  | Intervention technique sur la base de données, à tracer dans le ticket de support                                                       |

## Nouveautés d'octobre 2026

| Nouveauté                                                                                                 |
| --------------------------------------------------------------------------------------------------------- |
| Page **Utilisateurs** : comptes et rôles de tous les établissements (retirée de l'espace établissement)   |
| Boutons « Démarrer l'essai gratuit » et « Activer l'abonnement » dans **Abonnements**                     |
| Onglet « Catalogue établissements » dans **Données de référence**                                         |
| Données de démonstration dans AuriGeo School : 100 élèves, 19 enseignants, 13 emplois du temps            |
| Double authentification désactivable : variable `MFA_REQUIRED_FOR_SENSITIVE_ROLES` (actuellement `false`) |
