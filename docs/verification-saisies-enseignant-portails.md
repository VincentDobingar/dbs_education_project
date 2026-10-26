# Vérification des saisies enseignant et de leur visibilité

Vérification locale du 24 octobre 2026 : École de la vie, classe 3e A, Sara Test-Famille.

## Données saisies dans le navigateur

Avec le compte `enseignant.ecolevie@example.test` :

- Pointage du 24/10/2026 : En retard. L’appel existant pour cette matière et cette date a été remplacé.
- Évaluation « TEST ENSEIGNANT — Mathématiques 24/10/2026 » : note de Sara passée de 16 à 17/20.
- Devoir « TEST PARCOURS 24-10 — Fractions 3e A », échéance au 06/11/2026, avec consigne de simplification de 12/18.
- Incident mineur « TEST PARCOURS 24-10 — Bavardage de démonstration », sanction « Rappel des règles (test) » et action corrective de démonstration.

Les quatre données ont été retrouvées dans les tableaux administratifs filtrés sur 3e A, puis dans les portails parent et élève de Sara. Les données sont conservées pour les essais locaux.

Le dossier d’Adam en 4e A a également été ouvert dans le navigateur : il ne contient ni l’évaluation, ni le devoir, ni l’incident ajoutés pour Sara.

## Corrections

Le portail parent disposait des bulletins, mais pas des notes détaillées. Une lecture des seules notes publiées a été ajoutée. Le suivi disciplinaire manquait dans les deux portails : il affiche maintenant date, gravité, description, sanction et action corrective, sans identifiant du personnel déclarant. Les routes exigent un rattachement vérifié et un abonnement actif couvrant l’enfant.

La publication reste réservée aux rôles de direction déjà autorisés par l’API. Le bouton sans droit de publication a été retiré de la vue enseignant. Le tableau administratif permet à la direction de publier une évaluation sans saisir ou modifier ses notes. Le compte SCHOOL_ADMIN ordinaire reste sans droit de publication.

Le brouillon à 17/20 a été vérifié comme absent du portail parent avant publication. Sa publication a ensuite été réalisée depuis le navigateur avec un compte DIRECTOR local ; le 17/20 apparaît ensuite dans les portails parent et élève.

## Compte de direction de démonstration

`direction.ecolevie@example.test`, établissement `ecolevie`, rôle DIRECTOR uniquement. Script `prisma/seed/test-director-account.ts`, exécuté avec `TEST_DIRECTOR_PASSWORD`. Il refuse une base distante ou ne se terminant pas par `_dev`, conserve les mots de passe existants et trace la création du rôle. Les identifiants des autres comptes de test restent inchangés.

## Contrôles automatisés

- 3 tests d’intégration API réussis : portails parent, élève et restrictions administratives. Ils couvrent notamment les refus sans lien et sans abonnement, les notes publiées uniquement, les incidents supprimés exclus et la projection publique des incidents.
- 6 tests d’interface réussis : suivi scolaire familial, page enfant et tableau administratif.
- TypeScript API et web réussi.

Le test parent ancien a été remis en conformité avec le périmètre enseignant : année courante et affectation pédagogique explicite, avec contrôle du succès de l’enregistrement de l’appel.

Preuves navigateur : `output/teacher-verification/student-follow-up.png` et `output/teacher-verification/parent-follow-up.png`.
