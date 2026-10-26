# Portail parent : identité commune et couvertures enfant–établissement

## Parcours

1. L'établissement enregistre le tuteur principal dans **Parents / tuteurs**, avec son email ou téléphone, puis le rattache à l'élève.
2. Le personnel émet une invitation parent nominative depuis la fiche élève. Lorsque son destinataire correspond au contact du tuteur principal, l'invitation capture ce dossier local. Le parent doit vérifier ce contact et utiliser le code d'invitation. Aucun rapprochement par nom ni simple recherche d'email ne confère de lien.
3. Le premier rattachement crée le profil central `Guardian` lié au compte `User`. Les autres établissements se rattachent au même profil après leurs propres invitations vérifiées. Un profil central déjà existant reste la source de référence.
4. Le parent utilise **Mon profil** (`/portail/profil`) pour modifier prénom, nom et adresse. Une transaction met à jour le profil et les fiches locales liées aux relations parent-enfant encore vérifiées, sous le contexte RLS de chaque établissement. Les données pédagogiques restent locales.
5. Le changement d'email ou de téléphone demande le mot de passe actuel et un code adressé au nouveau contact. Le code expire après dix minutes, accepte au maximum cinq erreurs et n'est utilisable qu'une fois par son demandeur. L'API ne le renvoie jamais. L'envoi exige un transport SMTP/SMS configuré ; son absence ou son échec renvoie une erreur explicite sans modifier le contact. Le contact confirmé est actualisé sur le compte de connexion et les fiches liées.
6. Dans **Mes abonnements** (`/portail/abonnements`), le parent sélectionne explicitement les enfants ET établissements couverts. Un forfait individuel couvre un couple ; un forfait familial couvre plusieurs couples dans la limite `SubscriptionPlan.childrenCovered`.
7. Le parent prépare une facture et une référence de règlement. Le statut reste sans droit d'accès jusqu'à un paiement confirmé. Il ne peut pas certifier lui-même un paiement espèces : `POST /platform/parent-subscriptions/:id/cash-payment` est réservé à `SUPER_ADMIN` ou `BILLING_MANAGER` et exige une justification. Les confirmations électroniques utilisent les webhooks existants.

## Droits d'accès

`ParentSubscriptionCoverage` associe le parent, le dossier élève, son établissement et l'abonnement. Une clé étrangère composite impose le bon établissement. L'index SQL partiel interdit deux couvertures courantes pour le même couple enfant–établissement, y compris sous concurrence.

La réservation est créée avec le brouillon pour éviter des facturations concurrentes en double. Elle est libérée à l'annulation, au remboursement ou à l'expiration ; une couverture dont l'ancien parent n'a plus de relation vérifiée ne bloque pas le nouveau titulaire. Une nouvelle formule nécessite d'annuler la réservation existante. L'historique des anciennes couvertures est conservé avec `releasedAt`.

L'accès scolaire exige simultanément une relation parent-enfant vérifiée et non révoquée, un dossier élève disponible, un établissement autorisé, une couverture non libérée appartenant au parent et un abonnement **ACTIVE** non expiré. Les brouillons, attentes de paiement, essais, périodes de grâce, suspensions et abonnements terminés ne donnent pas accès au portail parent. Les contrôles de licences sponsorisées existants restent appliqués.

Le dashboard exclut les enfants non couverts **avant** toute lecture de leurs notes, présences, annonces ou finances. Chaque route détaillée applique le même contrôle. Les quotas de téléchargement PDF sont imputés à l'abonnement exact de l'enfant, même si le foyer possède d'autres abonnements plus récents.

Sans couverture active, la coque du portail, le profil, l'activation et la sélection des abonnements restent disponibles. L'écran de sélection ne présente que l'identité et l'établissement des enfants déjà vérifiés, sans données scolaires.

Les réponses API parent utilisent `Cache-Control: private, no-store`. Le service worker traite ces requêtes en `NetworkOnly` et l'ancien cache partagé `portal-api-cache` est purgé. Le dashboard et la fiche enfant masquent les données si les droits ne peuvent pas être revérifiés en ligne. L'accès parent aux données scolaires nécessite donc une connexion ; l'app shell et le fonctionnement hors ligne du portail élève restent distincts.

## Reprise de l'existant

- La migration n'invente aucun lien entre les fiches locales et les comptes. Les dossiers déjà saisis se rattachent par une invitation nominative, même si un ancien lien parent-enfant existe déjà.
- Un ancien abonnement familial sans couverture explicite ne débloque plus de données scolaires. Son titulaire sélectionne les enfants et utilise **Rattacher les enfants sélectionnés** sur l'abonnement existant. Aucun second paiement n'est exigé pour rattacher un abonnement déjà actif.
- La sélection d'enfants est fixée par abonnement. Un abonnement ayant déjà des couvertures ne peut pas être réaffecté à d'autres élèves durant sa période.
- Les routes historiques `/subscriptions/family` restent disponibles pour les contrats existants. Les nouvelles routes par identifiant `/parent-portal/subscriptions/:id/...` vérifient le propriétaire et permettent plusieurs abonnements individuels simultanés dans un même foyer. La route historique d'auto-confirmation espèces du parent répond désormais `403 BILLING_AGENT_REQUIRED`.
- Une fiche locale liée au profil central devient non modifiable directement par l'établissement. Les rôles de personnel conservent la gestion des élèves, invitations et révocations ; un changement de profil ne crée aucun nouveau lien ni aucun abonnement.

## Vérification

Les tests d'intégration couvrent la synchronisation multi-établissements, l'absence de propagation vers un dossier non vérifié ou une relation révoquée, la vérification des contacts, le refus de réutilisation de code, le paiement par agent, les formules individuelles et familiales, les doublons concurrents, l'expiration et la séparation entre les abonnements d'un même foyer. Les tests d'interface vérifient les sélections, le profil et le masquage des anciennes données en cas d'échec réseau.
