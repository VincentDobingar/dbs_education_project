# Reçus de paiement premium

Vérification locale du 23 octobre 2026.

Le générateur commun aux portails parent, élève et à la gestion financière produit un reçu A5 avec la palette EduManage, le logo de l'établissement en haut à gauche et en filigrane, les références du reçu et de la facture, l'élève, le montant avec sa devise, le mode de règlement, la date et l'agent. Les remboursements partiels et complets restent signalés avec le montant net.

Le téléchargement a été effectué dans le navigateur avec le parent `parent.famille@example.test`, puis avec l'élève `eleve.ecolevie.1@example.test`, pour Sara à École de la vie. Les deux fichiers obtenus sont des PDF valides d'une page avec deux placements du logo et les informations attendues. Le rendu final affiche correctement « 5 000 XAF » et « Agent Test local ».

Exemple : `output/pdf/recu-premium-ecole-de-la-vie.pdf`.

Validation : 12 tests ciblés réussis (mise en page, paiements, remboursements et portails), vérification TypeScript et lint. Les quatre tests de mise en page ont été rejoués après normalisation des espaces du montant pour les polices PDF standard.
