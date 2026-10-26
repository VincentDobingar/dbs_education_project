# Données de base locales

`pnpm db:seed:basics --all` complète les établissements existants de la base PostgreSQL locale. Pour un seul établissement : `pnpm db:seed:basics --tenant=<id>`.

Le script conserve les personnalisations existantes : année courante (sinon 2026-2027), campus principal, trois cycles, treize niveaux du CP1 à la terminale, une classe par niveau sans classe existante, salles, matières et coefficients du référentiel francophone fourni. Il ajoute les catégories de frais, types d'évaluation, départements et catégories de dépenses. Trois trimestres sont créés seulement si l'année n'a aucun découpage.

Une période d'inscription est ajoutée seulement en l'absence de période pour l'année. Elle reste **fermée**, avec trois échéances d'exemple de 1 000 000 centimes chacune (10 000 unités de la devise de l'établissement). Adapter montants et dates avant ouverture. Aucune facture, aucun encaissement, aucun élève, parent ou membre du personnel n'est créé. Les programmes, horaires, jours fériés et tarifs réels demandent un choix de l'établissement.

Le script est relançable sans doublons ; chaque établissement est traité dans sa propre transaction avec son contexte RLS. Les autres établissements déjà traités restent enregistrés si une transaction suivante échoue.

## Double authentification temporairement suspendue

Dans `apps/api/.env`, `DEV_SKIP_MFA=true` contourne le défi et l'enrôlement MFA uniquement avec `NODE_ENV=development`. Les secrets et codes de secours existants restent conservés. Le drapeau est ignoré en test et en production. Il est désactivé par défaut dans le code et le fichier d'exemple.

Pour rétablir la protection locale, remettre `DEV_SKIP_MFA=false` et `MFA_REQUIRED_FOR_SENSITIVE_ROLES=true`, puis redémarrer l'API. Les modifications de `.env` seules ne déclenchent pas toujours le redémarrage du serveur de développement.
