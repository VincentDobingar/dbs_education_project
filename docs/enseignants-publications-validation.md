# Enseignants : périmètre, travaux et validation des cours

Vérifications locales terminées le 24 octobre 2026.

## Droits et navigation

- Les menus Inscriptions et Bulletins sont masqués pour un compte enseignant ; les accès directs correspondants sont également refusés côté API.
- L’enseignant consulte uniquement son emploi du temps de l’année courante, à partir de son identité employé, sans identifiant d’un autre professeur fourni par le navigateur.
- Les listes d’élèves, classes, matières, évaluations, présences, incidents, travaux et cours sont limitées aux affectations actuelles. Les contrôles portent aussi sur les identifiants directs et les écritures ; les listes déroulantes ne constituent pas la seule protection.
- La saisie des présences et notes vérifie l’appartenance des élèves à la classe concernée avant les écritures.
- Un utilisateur possédant aussi un rôle de direction/administration conserve les droits explicites de cet autre rôle. Les affectations ne donnent aucun rôle administratif.

`requireTenantMembership` charge le périmètre depuis les affectations actives et les inscriptions de l’année courante. Un contexte asynchrone propre à la requête applique les filtres dans le client Prisma tenant. Les transactions utilisant le client brut continuent de nécessiter une vérification préalable explicite du dossier ou du cours. La RLS existante reste chargée de l’isolation entre établissements.

Les caches de l’interface sont vidés lors d’une nouvelle connexion établissement pour ne pas conserver les anciennes listes d’un autre compte.

## Travaux scolaires

Le formulaire Devoirs propose cinq catégories : devoir, travaux pratiques, interrogation, sujet d’exposé et exercice. Un travail créé est immédiatement publié pour les élèves actuellement inscrits dans sa classe et leurs parents autorisés. Les portails présentent la catégorie, l’intitulé, les consignes et l’échéance.

## Cours et ressources

Un cours peut contenir du texte, des liens, une vidéo YouTube publique et des fichiers PDF téléversés. Les liens ne sont jamais récupérés par le serveur. Le téléversement PDF vérifie le type déclaré et la signature `%PDF-`, avec une limite de 10 Mo. Il ne remplace pas un antivirus ou une validation structurelle complète du document.

Les fichiers sont stockés dans `private-course-files`, dossier frère de `UPLOAD_DIR`, hors de l’arborescence publique `/uploads`. Le téléchargement exige une session et un droit sur la classe ; côté famille, le cours doit aussi être approuvé. Les réponses PDF portent `Cache-Control: private, no-store`.

Les cours sont gratuits, sans achat de cours supplémentaire ; les droits et abonnements habituels donnant accès aux portails restent requis.

### Circuit de validation

1. L’enseignant crée un cours et charge ses ressources : statut **En attente**.
2. L’administration ouvre le cours depuis **E-learning → Ouvrir**, examine les ressources et utilise **Valider et rendre visible aux familles** ou **Refuser le cours**.
3. Seuls les cours **Validés** sont visibles et téléchargeables dans la classe concernée, côté élève et parent.
4. Une modification du cours, l’ajout ou la suppression d’une ressource rétablit le statut **En attente**, y compris après une validation précédente.

Les rôles SCHOOL_OWNER, SCHOOL_ADMIN, DIRECTOR et ACADEMIC_DIRECTOR peuvent valider. L’enseignant seul ne peut pas s’auto-valider, y compris en appelant directement l’API. Les décisions sont journalisées. L’ajout/suppression des ressources et la réinitialisation de l’approbation sont atomiques en base.

La migration `20261024090000_teacher_course_review` est appliquée localement et dans la base de tests. **Les cours préexistants passent également en attente** : l’administration doit les examiner avant leur visibilité dans les portails.

## Essais conservés pour l’utilisateur

- Compte enseignant existant : `enseignant.ecolevie@example.test`, établissement `ecolevie`.
- Créneau de démonstration : lundi 17 h – 18 h, mathématiques, 3e A.
- Cinq travaux `TEST PUBLICATION — …` en 3e A.
- Cours `TEST VALIDATION — Fractions (PDF et YouTube)`, validé par le compte administrateur, avec un PDF de démonstration et une [vidéo publique de Khan Academy sur les fractions](https://www.youtube.com/watch?v=WPimvspI0_c).

Les cinq travaux et le cours ont été retrouvés pour Sara dans son portail et dans celui de son parent. Leur absence a été vérifiée pour Adam, inscrit dans une autre classe. Le PDF a été téléchargé réellement depuis les deux portails : `cours.pdf` et `cours (1).pdf` dans les téléchargements locaux. Le cours en attente était inaccessible avant validation ; une modification de ressource le masque à nouveau.

## Validation technique

- 17 tests API ciblés réussis sur les cours, devoirs, dashboards, présences, discipline, emplois du temps et configuration ; nouvelle exécution des 5 tests cours/dashboard après le dernier filtrage des périodes : réussie.
- 18 tests frontend réussis, couvrant navigation, espace enseignant, publication/validation, PDF parent et client API.
- TypeScript API, web et seeds : réussi. Lint ciblé : réussi.
- Contrôles supplémentaires : autre classe du même établissement inaccessible, emploi du temps sans créneaux d’un autre professeur, PDF masqué avant approbation, refus de l’auto-validation, retour en attente après modification.

Cette vérification porte sur les modules concernés et ne constitue pas l’exécution de toute la suite du monorepo.
