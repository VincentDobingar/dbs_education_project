# Administration, consultations et récréations

## Fonctionnement

- Le refus d’un cours exige un motif non vide, contrôlé dans l’interface et par l’API. Validation et refus créent une notification interne pour son enseignant. Le marquage comme lu est conservé après rechargement.
- Le menu Utilisateurs est réservé à l’espace superadmin. Sa page permet la recherche et la consultation des comptes. Les routes correspondantes refusent les comptes ordinaires des établissements.
- Présences, notes, devoirs et discipline présentent à l’administration des tableaux de consultation filtrés par classe. La saisie est réservée aux enseignants, avec contrôle supplémentaire dans l’API.
- Les emplois du temps affichent les jours en lignes et les heures en colonnes. Les récréations sont configurées par établissement et année courante ; un cours ne peut pas les chevaucher. Elles sont également transmises aux portails parent et élève.

## Vérifications locales

Avec les comptes administrateur et enseignant de test d’École de la vie, le navigateur a confirmé le blocage d’un refus sans motif, l’enregistrement du motif, la validation suivante, la réception des deux notifications et la persistance de leur état de lecture. Le cours de démonstration est laissé validé.

Les quatre tableaux administratifs, l’absence du menu Utilisateurs dans l’établissement et la recherche du compte enseignant dans l’espace superadmin ont été vérifiés. Une récréation de démonstration de 10 h à 10 h 15, du lundi au samedi, est enregistrée pour École de la vie.

Les contrôles ciblés comptent 18 tests API et 14 tests d’interface réussis. Le test des restrictions administratives a été relancé avec succès après l’ajout du contrôle sur la correction des notes publiées. Les vérifications TypeScript des deux applications sont également passées.

Captures : `output/teacher-verification/institution-timetable.png`, `institution-presences.png` et `teacher-notifications.png`.
