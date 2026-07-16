# Migrations PostgreSQL de MedCareSO

MedCareSO 2.1.1 utilise uniquement les migrations SQL natives du dossier
`src/main/database/migrations` pour créer et faire évoluer son schéma. Le
fichier historique `database-schema-source.sql` n'est plus lu ni converti au
démarrage.

## Fonctionnement au démarrage

Après l'ouverture de la connexion PostgreSQL, l'application :

1. prend un verrou consultatif PostgreSQL pour empêcher deux instances de
   migrer simultanément ;
2. crée `schema_migrations` si nécessaire ;
3. charge les fichiers `NNN_nom.sql` dans l'ordre numérique ;
4. vérifie le SHA-256 de toute migration déjà enregistrée ;
5. exécute chaque nouvelle migration dans sa propre transaction ;
6. annule la migration en cours et bloque le démarrage en cas d'erreur.

La table `schema_migrations` conserve la version, le nom, le checksum, la date,
la durée d'exécution et le statut `adopted`.

## Base neuve

Créer le rôle, la base et les droits avec :

```powershell
psql -U postgres -f SETUP_WINDOWS/SCRIPT_POSTGRESQL_COMPLET.sql
```

Le script demande le mot de passe du rôle applicatif. Il ne crée aucune table
métier. Configurer ensuite la même connexion dans l'écran PostgreSQL de
MedCareSO et lancer l'application : les migrations créent automatiquement le
schéma complet.

## Base MedCareSO existante

Avant la mise à jour :

1. fermer toutes les instances de MedCareSO ;
2. créer une sauvegarde vérifiable avec `pg_dump` ;
3. restaurer cette sauvegarde sur une machine ou base de validation ;
4. démarrer la nouvelle version sur la copie et contrôler les dossiers réels ;
5. seulement ensuite répéter l'opération sur la base client.

Lorsqu'une base contient déjà des tables mais aucune ligne de migration, le
runner accepte uniquement une structure MedCareSO reconnaissable : les tables
principales `users`, `patients`, `consultations`, `settings`, `inventory`,
`inventory_movements`, `plan_equipment_usage` et au moins deux tables de support.
Il enregistre alors la migration initiale comme adoptée,
sans recréer ni supprimer les données, puis applique les migrations suivantes.
Une base arbitraire est refusée.

## Échec et récupération

- Ne modifiez jamais un fichier de migration déjà livré. Son checksum doit
  rester immuable ; une correction ultérieure reçoit un nouveau numéro.
- Si une migration échoue, la transaction concernée est annulée. Lire le nom
  et la version dans le journal, corriger la donnée ou livrer une nouvelle
  migration, puis redémarrer.
- Ne supprimez et ne modifiez pas manuellement une ligne de
  `schema_migrations` pour contourner un échec.
- En cas d'incertitude, remettre la sauvegarde dans une base séparée et refaire
  la validation. Ne restaurez sur la base client qu'après décision explicite.

## Test automatisé isolé

Le test refuse toute URL dont le nom de base ne contient pas `test`. Il remet
uniquement le schéma `public` de cette base dédiée à zéro et le nettoie à la
fin.

```powershell
$env:MEDCARESO_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/medcareso_migration_test'
npm run test:migrations
```

Il couvre une base neuve, un second démarrage idempotent, l'adoption d'une base
existante, la conservation des lignes, les neuf tables des modules inventaire,
POS et équipement, ainsi que des violations de contraintes attendues.

### Transactions métier

Les opérations multi-requêtes utilisent `withTransaction()`. Le contexte
asynchrone route automatiquement `query`, `queryOne` et `run` vers le même
client PostgreSQL jusqu'au `COMMIT`. Une exception déclenche `ROLLBACK` et un
appel transactionnel imbriqué utilise un savepoint.

Les déductions FEFO verrouillent les lignes de lots avec `FOR UPDATE`. Des
verrous consultatifs transactionnels sérialisent aussi les créneaux de rendez-vous,
les doublons de paiement, les plans actifs et les numéros de séance.

Le test suivant vérifie le commit, le rollback forcé, les savepoints, le même
client PostgreSQL, deux ventes concurrentes sur un lot et le rollback complet
d'un flux de vente de type POS :

```powershell
$env:MEDCARESO_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/medcareso_transaction_test'
npm run test:transactions
```

## Ajouter une migration

Créer le prochain fichier `NNN_description.sql` avec un numéro unique. Utiliser
uniquement du SQL PostgreSQL natif et des opérations sûres pour une base client
existante. Ajouter des contrôles explicites avant les contraintes lorsque des
données historiques peuvent les bloquer, puis exécuter le test automatisé.
