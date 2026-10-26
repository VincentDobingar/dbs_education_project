# Vérification du parcours parent local

Vérification réalisée le 23 octobre 2026 sur AuriGeo et Ecole de la vie avec les comptes de démonstration documentés dans `familles-test-locales.md`.

- Le dashboard du parent abonné retourne quatre enfants, moyennes 14 et 15, avec 15 000 unités payées et 15 000 restantes par enfant.
- Les fiches affichent les bulletins, cinq pointages de présence et deux reçus. Les huit routes PDF (bulletin et reçu pour chacun des quatre enfants) répondent HTTP 200 avec des documents non vides.
- Une modification temporaire du prénom et de l'adresse via le profil parent est visible dans les contacts administratifs des deux établissements. Les valeurs initiales sont restaurées après le contrôle.
- Le parent sans abonnement ne reçoit pas de données scolaires et ne peut accéder à un enfant d'une autre famille.
- Une invitation nominative créée via l'API d'administration d'établissement est acceptée par le bon parent, refusée pour un autre bénéficiaire et inutilisable une seconde fois. Minuscules, espaces de copie et séparateurs sont tolérés.

## Corrections

La connexion n'envoie plus systématiquement vers l'activation : un parent déjà lié arrive sur son dashboard ; un élève lié arrive sur son portail ; les comptes sans rattachement passent par l'activation.

Les abonnements fictifs avaient été insérés sans leurs droits matérialisés `Entitlement`. Les scripts locaux de familles et de suivi créent désormais ces droits selon `PlanFeature`, sans réinitialiser les quotas consommés. Les contrôles d'abonnement et de quota restent en place.

Les PDF sont téléchargés via un lien de fichier plutôt qu'une fenêtre surgissante ouverte après un appel réseau. Un refus de forfait/quota ou une erreur réseau est affiché dans la fiche, au lieu d'une erreur silencieuse. Les erreurs des sections scolaires sont également signalées.

## Pourquoi 000PP12026 était refusé

Ce code existe dans `PromotionCode`, pas dans `ActivationCode`. Il ne peut pas rattacher un enfant. Il s'utilise dans le champ **Code promotionnel (facultatif)**, ajouté à **Mes abonnements**, lors de la création d'une souscription. Une promotion est soumise à ses dates, sa catégorie et son plafond d'utilisation ; elle ne prouve ni la parenté ni le paiement.

Pour un rattachement : ouvrir le dossier de l'élève côté établissement, sélectionner le bénéficiaire Parent et son email, puis créer une invitation. Le parent doit activer le code depuis le compte correspondant au destinataire. Les enfants du compte `parent.famille@example.test` sont déjà liés et n'ont pas besoin d'une nouvelle activation.

## Limites du contrôle

Les données financières et abonnements de démonstration sont fictifs. Les emails/SMS réels ne sont pas envoyés par cette vérification. Les tests de changement de contact utilisent les adaptateurs simulés de la suite d'intégration.

## Téléchargements réellement récupérés depuis le navigateur

Le navigateur intégré prépare le PDF via les boutons de la fiche. Le lien de fichier `a[download]` a permis de récupérer les fichiers dans `C:/Users/PC/Downloads/` :

- `bulletin-cmvkqzo05001xtagwsbgo6f2t.pdf` : 1 981 octets.
- `recu-cmvkqzo0u0024tagwbg7dm0uq.pdf` : 1 739 octets.
- `bulletin-cmvkqzntu0007tagwuxgy93ps.pdf` : bulletin du second établissement.
- `recu-cmvkqznvo000etagwx9aynb8b.pdf` : reçu du second établissement.

Les fichiers sont des PDF complets, contrôlés par signature `%PDF-` et terminaison `%%EOF`. La capture des téléchargements par événement ou par rôle de lien échouait dans l'outil ; la récupération du lien de fichier natif fonctionne. Les quatre fichiers ont été enregistrés depuis les commandes de la fiche parent, sur les deux établissements.

La fiche garde désormais un lien explicite **Télécharger le document PDF** après préparation. Elle conserve son état pendant le contrôle périodique des droits, tout en masquant les données jusqu'au résultat de ce contrôle. Un refus de droits démonte toujours la fiche et libère le document. Un test vérifie la conservation du lien lors d'une vérification temporaire.

## Limitation des connexions

Le store Redis utilisait le même préfixe pour la navigation générale et les tentatives d'authentification. Plus de vingt appels scolaires pouvaient donc bloquer une connexion légitime. Les compteurs sont maintenant séparés par politique (fenêtre et seuil, ou espace de noms explicite), sans identifiant de processus : une même politique garde son compteur partagé entre instances.

Vérifications : trois appels de navigation ne consomment pas la limite de connexion, la limite de connexion bloque toujours une fois atteinte, deux instances partagent toujours une même politique. En local réel, les connexions des deux parents réussissent après 22 appels de consultation ; les dashboards affichent respectivement quatre et deux enfants depuis l'activation générale des licences de test.
