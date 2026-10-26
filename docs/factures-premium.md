# Factures premium — vérification locale

Le 23 octobre 2026, ajout du téléchargement des factures émises dans la section Facturation du portail parent. Le générateur A4 utilise la palette EduManage et le logo de l'établissement en en-tête à gauche et en filigrane. Il affiche l'élève, l'année académique, les références, dates, statut, lignes avec remises, montant facturé, montant réglé et solde. Les longues factures sont paginées.

La route parent exige authentification, relation vérifiée et abonnement actif couvrant l'enfant. Elle vérifie également que la facture appartient à l'enfant demandé et exclut les brouillons et documents supprimés.

Téléchargement réel effectué dans le navigateur avec parent.famille@example.test, dossier Sara / École de la vie, tranche 2. PDF obtenu : output/pdf/facture-premium-ecole-de-la-vie.pdf. Contrôle visuel : une page A4, deux placements du logo, total 10 000 XAF, réglé 5 000 XAF, solde 5 000 XAF, année 2026-2027 et échéance 30/12/2026.

Tests ciblés : intégration parent (PDF et refus d'accès à une facture d'un autre enfant), deux tests de pagination PDF et trois tests frontend de téléchargement et de gestion des erreurs.

## Portail élève

Le téléchargement est également proposé dans la section Factures du portail élève. Les routes de liste et PDF exigent un lien au dossier élève et un abonnement actif ; les brouillons et factures supprimées sont exclus. L'appartenance de chaque facture est vérifiée avant génération.

Vérification navigateur le 23 octobre 2026 avec eleve.ecolevie.1@example.test : téléchargement de la tranche 2, PDF valide d'une page, contenu identique à celui obtenu via le portail parent (10 000 XAF facturés, 5 000 XAF réglés, 5 000 XAF restant), logo en en-tête et en filigrane. Tests d'intégration : liste et téléchargement autorisés, refus sans abonnement (402), compte sans lien (403), facture d'un autre élève (404). Trois tests ciblés réussis ; TypeScript et lint API/web validés.

## Gestion de l'établissement

Bouton Télécharger la facture dans Élèves → dossier élève → Facturation, pour les factures émises (brouillons exclus). Le PDF utilise le même générateur que les portails. La route financière impose authentification, établissement, appartenance à cet établissement, abonnement et permission finance.read ; le garde Prisma assure l'isolation des factures entre établissements.

Test navigateur avec dobingar.vincent@dbs-africa.org, École de la vie, Sara, tranche 2 : fichier téléchargé, une page, contenu identique aux portails parent/élève, logo en-tête et filigrane. Tests : génération autorisée, refus sans permission (403), autre établissement (404), lien de téléchargement et gestion des erreurs. Cinq tests ciblés réussis, vérifications TypeScript et lint réussies.
