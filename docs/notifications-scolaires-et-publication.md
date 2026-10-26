# Notifications scolaires, publication et emploi du temps

Vérification locale du 24 octobre 2026.

## Notifications internes

Les comptes actifs des parents ayant un lien vérifié non révoqué et le compte élève rattaché au dossier reçoivent les notifications suivantes :

- `grade.published` : uniquement lors de la publication de l’évaluation, pour les élèves disposant d’une note ; aucun envoi à la simple sauvegarde du brouillon.
- `homework.added` : à la création d’un travail, pour les élèves inscrits dans la classe et l’année correspondantes.
- `attendance.absence` : lorsqu’un pointage devient absent. Réenregistrer une absence inchangée ne produit pas une nouvelle alerte.
- `discipline.incident` : lors du signalement d’un incident.

Le panneau Notifications scolaires est présent dans les portails parent et élève, avec actualisation toutes les quinze secondes et marquage individuel comme lu. Les nouveaux messages identifient l’enfant et l’établissement. Les notifications restent privées au destinataire : un parent ne peut pas modifier l’état de lecture de la notification de son enfant.

La publication de l’évaluation et ses notifications sont enregistrées dans la même transaction, avec verrouillage pour éviter une double publication concurrente. La création d’un devoir et de ses notifications est également transactionnelle. Les notifications internes parent déjà existantes pour absences et incidents utilisent désormais le même résolveur de destinataires ; les préférences email parent existantes restent conservées.

## Publication des notes

Les droits existants restent réservés à SCHOOL_OWNER, DIRECTOR et ACADEMIC_DIRECTOR. La zone Publication des notes est désormais située au-dessus du tableau, après le choix de classe. Elle liste les évaluations en attente avec leur bouton Publier, ou indique que toutes les évaluations sont publiées. Aucun défilement horizontal n’est nécessaire pour trouver l’action.

Pour École de la vie, le propriétaire enregistré est `dobingarvincent@gmail.com` (SCHOOL_OWNER). Le compte de démonstration `dobingar.vincent@dbs-africa.org` porte SCHOOL_ADMIN et ne reçoit pas ce droit supplémentaire. Aucun mot de passe ni rôle de ces comptes n’a été modifié.

## Emploi du temps

La grille partagée affiche maintenant les heures en lignes et les jours du lundi au dimanche en colonnes. Les cours et récréations gardent leurs horaires. Cette présentation s’applique aux espaces établissement, enseignant, parent et élève.

## Vérifications

Dans le navigateur, l’enseignante de test a signalé une absence de Sara le 24/10/2026, ajouté « TEST NOTIFICATIONS — Fractions du 24 octobre » et un incident fictif. Elle a créé « TEST NOTIFICATIONS — Contrôle du 24 octobre » et enregistré 18/20 pour Sara ; la direction l’a publié avec le bouton désormais placé en tête. Les quatre notifications sont présentes dans les deux portails. Une notification parent et une notification élève ont été marquées comme lues puis rechargées : l’état persiste indépendamment pour chacun.

La grille de 3e A a été vérifiée dans le navigateur : colonnes Lundi à Dimanche, lignes horaires dont 10:00–10:15 pour la récréation. Les données de test restent disponibles.

- 6 tests d’intégration API ciblés réussis : destinataires, comptes étrangers et liens révoqués, propriété du marquage de lecture, annulation transactionnelle, présences/discipline et devoirs.
- 7 tests d’interface réussis : notifications, publication accessible au propriétaire, orientation de la grille et distinction des espaces parent/élève.
- TypeScript API et web, ainsi que lint ciblé : réussis.

Captures dans `output/teacher-verification/` : `publish-notes-top.png`, `parent-school-notifications.png`, `student-school-notifications.png`, `timetable-hours-rows.png`.
