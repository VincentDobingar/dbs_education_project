# Dashboard élève de démonstration et bulletin premium

`pnpm db:seed:test-complete-dashboard` complète les classes des six élèves `LOCAL-PARCOURS` d'AuriGeo et d'Ecole de la vie, uniquement dans la base locale `_dev`. Les identifiants stables empêchent les doublons. Aucun email, SMS ou paiement n'est envoyé.

Pour chacune des classes 3e A, 4e A et 5e A des deux établissements : dix matières issues des coefficients du niveau et une note publiée par matière pour chaque élève inscrit ; dix créneaux hebdomadaires avec matière, enseignant et salle ; deux devoirs avec énoncé et échéance ; deux cours contenant chacun une leçon et un exercice corrigé ; une annonce de classe et une annonce d'établissement. Les notes existantes sont conservées et un créneau en conflit n'est pas écrasé.

Les bulletins sont recalculés à partir des notes et coefficients. La classe de Sara, 3e A d'AuriGeo, compte actuellement un seul élève : le rang 1/1 correspond à ce jeu de données. Son bulletin contient dix matières et une moyenne pondérée de 14,11/20. Le script ne crée pas de camarades supplémentaires.

## Bulletin premium

Le générateur commun aux portails et à l'administration reprend la charte du projet : bleu nuit #0f172a, turquoise #14b8a6, or #f59e0b. Logo en haut à gauche et en filigrane discret, cartouche élève/classe/année, tableau alterné des matières, coefficients, appréciations, moyenne générale, rang, mention, emplacements de visa et pagination.

Les logos enregistrés d'AuriGeo et d'Ecole de la vie sont incorporés. Les uploads locaux sont lus seulement dans le répertoire `tenant-logos`, avec contrôle de l'origine, du nom généré, de la taille et du chemin réel ; les images externes gardent leur filtre HTTPS/SSRF. Un établissement sans logo conserve une identité typographique de remplacement.

Le logo de test d'Ecole de la vie est un emblème vectoriel original (livre et pousse végétale, monogramme EDV, mention TEST), aux couleurs du projet. Sources : `output/logos/ecole-de-la-vie-test.svg` et `.png`. Il a été téléversé via l'API de configuration, puis associé uniquement à `ecolevie`. Le bulletin de Sara a été régénéré dans `output/pdf/bulletin-premium-ecole-de-la-vie.pdf` : contrôle visuel du logo en haut à gauche et en filigrane, une page A4, deux placements d'image confirmés dans le PDF.

## Contrôles

Navigateur : dix notes, dix créneaux nommés, deux devoirs, deux cours et deux annonces visibles pour Sara ; leçon et exercice de fractions lisibles après ouverture du cours. PDF d'exemple : `output/pdf/edumanage-bulletin-premium.pdf`, une page A4, rendue en PNG et inspectée visuellement.

Tests : chargement local des logos, refus des chemins sortants et fichiers trop gros, PDF sans logo, pagination de 35 matières avec textes longs, génération et calcul des bulletins, parcours élève, devoirs et cours. Une deuxième exécution du seed conserve les mêmes six classes et les mêmes nombres de matières et contenus.
