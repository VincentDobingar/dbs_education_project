# Bulletins groupés, espaces distincts et profil élève

Vérification locale du 23 octobre 2026.

## Bulletins par classe

Dans la gestion de l'établissement, ouvrir Bulletins, choisir la classe et la période puis Télécharger les bulletins de la classe. Le fichier contient les bulletins déjà générés, triés par nom/prénom, avec une pagination propre à chaque bulletin. Classe et période doivent appartenir à la même année et au contexte de l'établissement ; authentification, appartenance, abonnement et permission grades.read restent requis. Sans bulletin, un message explicite est renvoyé.

Test réel avec le compte administrateur dobingar.vincent@dbs-africa.org à École de la vie : export 3e A / Trimestre 1 téléchargé et inspecté. La classe de démonstration contient Sara uniquement ; l'intégration teste également l'export de deux bulletins dans un même PDF. Exemple : output/pdf/bulletins-premium-classe-3e-a.pdf.

## Espaces parent et élève

La connexion reste commune. Les menus sont déterminés par les dossiers effectivement liés au compte. Un parent voit Mes enfants, Mon profil parent et Mes abonnements famille ; un élève voit Mon dashboard élève et Mon profil élève. Un compte cumulant les deux rôles peut choisir son espace. Les en-têtes et présentations des dashboards sont différents. Les autorisations serveur restent indépendantes du menu.

Vérification navigateur : parent.famille@example.test retrouve les quatre dossiers enfants dans deux établissements ; eleve.ecolevie.1@example.test affiche Bonjour Sara et le lien Mon profil et ma photo.

## Profil et carte scolaire

Le profil permet de téléverser une photo JPEG/PNG de 3 Mo maximum et de modifier adresse, téléphone, lieu de naissance, nationalité, nom et téléphone du contact d'urgence. Les noms, le matricule et l'inscription restent administrés par l'établissement. Les mutations exigent le lien élève et un abonnement actif ; les champs hors de la liste autorisée sont refusés. La photo est contrôlée par type et signature, et son chargement dans le PDF garde les restrictions réseau et les limites de taille.

La migration additive 20261023180000_student_profile_contacts a été appliquée aux bases locale et de test ; le client Prisma a été régénéré et l'API redémarrée.

La carte CR80 est désormais recto verso : identité/photo/classe/année au recto ; adresse, téléphone, lieu de naissance, nationalité et contact d'urgence au verso. L'export groupé de cartes contient donc deux pages par élève.

Le formulaire de Sara a été renseigné et enregistré dans le navigateur avec des coordonnées fictives. La photo de démonstration output/photos/eleve-test.png a été téléversée via l'API après un délai du sélecteur de fichiers du navigateur automatisé. Son affichage a été confirmé dans le profil rechargé ; le parcours frontend de sélection et d'envoi de fichier est aussi testé automatiquement. La carte a ensuite été téléchargée depuis le navigateur et ses deux faces rendues et inspectées. Exemple : output/pdf/carte-scolaire-premium-profil-sara.pdf.

Validation : 12 tests API/PDF/intégration et 9 tests frontend réussis ; TypeScript et lint API/web validés. Les tests couvrent le regroupement, la pagination, les images, la restriction des champs, le refus d'un compte étranger, le refus sans abonnement, les menus par rôle et l'enregistrement du profil.

## Édition du profil et photo dans la gestion

Dans Élèves → dossier élève, le bloc Profil complet de l'élève permet de corriger matricule, prénom, nom, date de naissance, sexe, adresse, téléphone, lieu de naissance, nationalité et contact d'urgence. Le rattachement au tuteur et les inscriptions restent disponibles dans leurs sections du même dossier. Les champs facultatifs peuvent être effacés et un matricule déjà utilisé est refusé. Les notes médicales ne sont pas exposées par ce formulaire.

Une photo JPEG/PNG de 3 Mo maximum peut être téléversée via POST /students/:id/photo. Les permissions students.write, l'appartenance à l'établissement et l'abonnement sont requis ; le dossier est contrôlé avant d'écrire l'image. Les types/signatures d'image sont vérifiés. Le portail et les cartes utilisent ce même Student.photoUrl et ces mêmes coordonnées. Après modification, l'ancien lien de carte préparée côté gestion est retiré.

Vérification avec l'administrateur d'École de la vie : coordonnées de Sara modifiées dans le navigateur (adresse à Yaoundé, téléphone de test, naissance le 13/03/2017, sexe F). Une nouvelle image fictive TEST ADMIN a été téléversée par la route administrateur, le sélecteur de fichiers du navigateur automatisé ayant précédemment été indisponible ; le parcours frontend de sélection/envoi est validé par test. Le portail élève montre les nouvelles valeurs et la photo après connexion. La carte a été téléchargée depuis ce portail, rendue et vérifiée : output/pdf/carte-scolaire-profil-admin-sara.pdf, deux faces CR80, photo TEST ADMIN au recto et nouvelles coordonnées au verso.

Validation : 16 tests API/intégration/PDF et 6 tests frontend réussis. Contrôles de permissions, rejet d'une photo falsifiée, refus d'un autre établissement, effacement des champs facultatifs et doublon de matricule couverts ; TypeScript et lint API/web validés.
