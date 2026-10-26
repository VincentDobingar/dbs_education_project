# Carte scolaire premium

Vérification locale du 23 octobre 2026 : téléchargement depuis Élèves → Sara → Télécharger la carte scolaire, avec le compte administrateur dobingar.vincent@dbs-africa.org de l'établissement École de la vie.

Le PDF conserve le format CR80 (85,6 × 54 mm), avec bandeau bleu nuit, accents turquoise et or EduManage, logo à gauche et en filigrane, photo ou initiales, identité, matricule, date de naissance si connue, classe et année scolaire. Les noms longs sont bornés pour conserver une seule carte. Les contrôles d'inscription et de statut et les protections des images distantes sont conservés.

Le téléchargement est direct, avec un lien persistant et un message d'erreur en cas d'échec ; les URL temporaires sont libérées. Exemple téléchargé et inspecté : output/pdf/carte-scolaire-premium-ecole-de-la-vie.pdf. Une page CR80, identité et inscription correctes, deux placements du logo vérifiés. Sara n'a pas de photo dans les données de test ; ses initiales sont affichées.

Validation : cinq tests d'intégration de génération et d'accès, un test de mise en page avec noms longs, TypeScript et lint API/web.

## Portails parent et élève

Téléchargement proposé dans le dossier enfant du portail parent et dans le dashboard élève. Les routes dédiées exigent authentification, lien parent-enfant vérifié ou lien au dossier élève, et abonnement actif couvrant le dossier ; le générateur conserve le contrôle de statut et d'inscription active.

Vérification navigateur avec parent.famille@example.test puis eleve.ecolevie.1@example.test : téléchargement réel de la carte de Sara à École de la vie dans les deux cas. Les deux PDF sont valides, d'une page CR80, avec le même contenu que le téléchargement administrateur et deux placements du logo. Six tests ciblés réussis (intégration des deux portails et interface parent), TypeScript API/web et lint validés.

## Téléchargement groupé par classe

Dans Élèves, le bloc Cartes scolaires par classe propose les classes de l'année en cours et produit un seul PDF CR80 avec une carte par élève actif inscrit, trié par nom/prénom/matricule et sans doublons. Les inscriptions supprimées ou inactives et les élèves sortis sont exclus. Une classe vide est signalée explicitement. L'API garde les permissions students.read, l'appartenance à l'établissement et l'abonnement actif ; une classe extérieure au contexte est introuvable.

Vérification navigateur avec le compte administrateur d'École de la vie : téléchargement pour 3e A, PDF valide avec Sara et deux placements du logo. Cette classe de test contient un seul élève ; le regroupement de plusieurs élèves et la déduplication sont couverts par test automatisé. Exemple : output/pdf/cartes-premium-classe-3e-a.pdf. La classe vide 6e A affiche le message explicite attendu. Tests de génération, classe vide, classe inaccessible et régression des cartes individuelles validés.

## Évolution du profil élève

Le profil et la carte sont désormais détaillés dans docs/profil-eleve-et-bulletins-groupes.md. Les cartes générées après cette évolution sont recto verso (deux pages CR80 par élève), avec photo au recto et coordonnées au verso, y compris dans l'export groupé par classe.
