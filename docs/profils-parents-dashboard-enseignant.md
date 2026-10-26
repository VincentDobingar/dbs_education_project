# Profils parents et espace enseignant — vérification locale du 24 octobre 2026

## Parents / tuteurs

Dans Parents / tuteurs, Modifier permet de corriger le prénom, le nom, le téléphone de contact, l’email de contact et l’adresse. La section photo accepte une image JPEG ou PNG de 3 Mo maximum ; le serveur vérifie aussi sa signature.

Un dossier local non lié reste propre à son établissement. Un profil central lié est synchronisé uniquement vers les dossiers dont le rattachement au tuteur principal est vérifié et non révoqué. Les modifications administratives sont journalisées. Les identifiants de connexion du compte User et leurs vérifications ne sont pas remplacés par l’édition administrative des coordonnées.

Vérification locale : adresse modifiée dans le navigateur depuis École de la vie ; photo de démonstration chargée par la route API administrateur ; égalité des données vérifiée dans École de la vie, AuriGeo et le profil parent. Le navigateur affiche la photo chargée et les deux établissements. Une modification d’adresse depuis le portail parent a ensuite été retrouvée dans les deux dossiers administratifs. Le téléversement par le sélecteur de fichiers du navigateur n’a pas été automatisé ; le téléversement HTTP et sa synchronisation sont couverts par les tests d’intégration.

## Personnel et accès enseignant

Le formulaire de création et la fiche Personnel contiennent l’email et une matière principale. Les matières sont validées dans l’établissement courant. Les affectations pédagogiques précisent séparément les classes, matières et années enseignées : une spécialité seule n’autorise pas l’accès à une classe.

Depuis la fiche Personnel, un responsable RH autorisé peut lier un compte existant ayant déjà un rôle Enseignant et une adhésion active à cet établissement. Cette opération ne crée pas de compte et n’accorde pas de rôle supplémentaire. Le propriétaire peut ajouter les affectations pédagogiques depuis cette fiche. Les droits existants sur Personnel sont conservés : SCHOOL_OWNER ou HR_MANAGER ; le simple SCHOOL_ADMIN n’a pas hr.manage.

L’espace `/enseignant` propose les classes et matières affectées pour l’année courante, la liste de présence avec reprise de l’appel existant, les évaluations brouillons, la saisie des notes et les annonces/devoirs. Les notes publiées sont verrouillées. Une note vide n’est pas transformée en zéro. Les nouvelles routes de cet espace contrôlent l’employé lié, l’affectation, l’année et l’appartenance des élèves à la classe. Le contrôle des anciennes routes génériques Notes/Présences et des autres modules enseignants a ensuite été étendu : voir `enseignants-publications-validation.md`.

## Compte local de démonstration

- Identifiant établissement : `ecolevie`.
- Email : `enseignant.ecolevie@example.test`.
- Rôle : Enseignant uniquement, sans rôle administrateur.
- Fiche : Awa Enseignante-Test, matricule personnel `LOCAL-ENSEIGNANT-TEST`.
- Affectations : mathématiques en 3e A, 4e A et 5e A pour 2026-2027.
- Seed : `prisma/seed/test-teacher-account.ts`, limité à une base locale dont le nom se termine par `_dev`. Le mot de passe initial est fourni par `TEST_TEACHER_PASSWORD` ; une nouvelle exécution ne réinitialise pas le mot de passe d’un compte existant.

## Résultats

- 10 tests d’intégration API ciblés : profil parent, couvertures, dashboard et personnel, tous réussis.
- Nouvelle vérification du dashboard après validation stricte des dates : 2 tests réussis, dont la reprise de l’appel et le refus d’une date impossible.
- 8 tests frontend : espace enseignant, formulaire email/matière et espace parent, tous réussis.
- TypeScript API, web et seeds : réussi ; lint des fichiers contrôlés : réussi.
- Navigateur enseignant : connexion, trois affectations visibles, appel du 24/10/2026 enregistré, contrôle « TEST ENSEIGNANT — Mathématiques 24/10/2026 » créé en brouillon, note de Sara à 16/20 enregistrée et conservée après rechargement, évaluation publiée en lecture seule.

Les contrôles ne constituent pas une exécution de toute la suite du monorepo. Les données de démonstration ajoutées restent disponibles pour les essais locaux.
