# Dossier source — Guide professionnel d’installation MedCareSO

## Utilisation de ce fichier

Ce document contient les informations factuelles et le déroulement opérationnel à transmettre à un outil de génération documentaire comme ChatGPT. Il peut être joint avec le fichier `PROMPT_CHATGPT_GUIDE_INSTALLATION.md` pour produire un guide Word destiné aux installateurs et aux responsables de cabinet.

Le document final doit rester compréhensible par une personne qui connaît Windows et les réseaux locaux sans être développeur. Aucun mot de passe réel, aucune clé de licence et aucune donnée patient ne doivent apparaître dans la version générée.

---

## 1. Identité du document

| Champ | Valeur |
|---|---|
| Produit | MedCareSO |
| Version | 2.1.1 |
| Type de document | Guide d’installation et de mise en service d’un cabinet |
| Public principal | Installateur informatique, administrateur du cabinet |
| Public secondaire | Médecin responsable, support technique |
| Plateforme | Windows 10/11 64 bits |
| Base de données | PostgreSQL locale, partagée sur le réseau privé |
| Port PostgreSQL | 5432 par défaut |
| Portail patient | Port 4580 par défaut |
| Niveau de confidentialité | Interne au cabinet / installateur autorisé |

### Objectif

Installer MedCareSO de manière reproductible et sécurisée, connecter tous les postes à la même base, activer les fonctions du cabinet, tester le portail patient et remettre une installation sauvegardée et documentée.

### Résultat attendu

À la fin de l’intervention :

- PostgreSQL fonctionne sur le PC serveur ;
- la base `cabinet_db` et le rôle `cabinet_app` existent ;
- MedCareSO fonctionne sur le serveur et tous les postes clients ;
- les comptes utilisateurs et les spécialités sont configurés ;
- la licence est active et reconnue sur tous les postes ;
- le QR patient est testé si le portail est utilisé ;
- les imprimantes et le scanner sont testés ;
- une sauvegarde est créée et une restauration de test est documentée ;
- le responsable du cabinet reçoit les informations de remise.

---

## 2. Architecture de référence

### 2.1 PC serveur / principal

Le serveur est un PC du cabinet qui héberge :

- PostgreSQL ;
- la base unique `cabinet_db` ;
- MedCareSO ;
- le portail patient local lorsque celui-ci est activé.

Le serveur utilise `127.0.0.1:5432` pour sa propre connexion à PostgreSQL. Son adresse IPv4 locale doit être réservée dans le routeur pour les postes clients et les téléphones.

### 2.2 Postes clients

Chaque poste client contient MedCareSO mais aucune base indépendante. Il utilise :

- l’IPv4 locale du PC serveur ;
- le port 5432 ;
- la base `cabinet_db` ;
- le compte PostgreSQL `cabinet_app` ;
- le mot de passe unique choisi pour le cabinet.

Un poste client ne doit jamais utiliser `127.0.0.1`, car cette adresse désigne le poste client lui-même.

### 2.3 Téléphones des patients

Les patients utilisent un navigateur web. Aucune application mobile n’est nécessaire. Pour un portail uniquement local, le téléphone doit être connecté au Wi-Fi privé du cabinet.

Format de l’adresse :

```text
http://IP_SERVEUR:4580/rdv/TOKEN
```

### 2.4 Principe de partage

La base, les données, les paramètres et la licence appartiennent au cabinet. Les postes sont seulement des points d’accès à la même base. Le PC serveur doit rester disponible pendant les heures d’utilisation.

---

## 3. Décisions avant installation

### 3.1 Nouveau cabinet

- Créer une nouvelle base vide avec le script PostgreSQL fourni.
- Installer MedCareSO sur le serveur.
- Laisser les migrations versionnées créer le schéma.
- Configurer ensuite les utilisateurs, la licence et le cabinet.

### 3.2 Cabinet existant

- Ne jamais modifier l’unique base historique sans copie.
- Sauvegarder la base existante.
- Réaliser la migration sur un poste ou une base de test.
- Comparer les nombres de patients, paiements, dettes, rendez-vous, plans de traitement et éléments de stock.
- Contrôler manuellement plusieurs dossiers patients connus.
- Faire une dernière sauvegarde avant la bascule.
- Conserver l’ancien système en lecture seule pendant un à deux mois, selon la politique du cabinet.

### 3.3 Fiche de préparation à remplir

| Information | Valeur à renseigner |
|---|---|
| Cabinet | |
| Responsable | |
| Installateur | |
| Date d’installation | |
| Nom Windows du serveur | |
| IPv4 réservée du serveur | |
| Masque / sous-réseau | |
| Nombre de postes clients | |
| Emplacement des sauvegardes | |
| Imprimante standard | |
| Imprimante thermique | |
| Scanner | |
| Contact support | |

Les mots de passe sont remis séparément dans un support sécurisé.

---

## 4. Prérequis

### Matériel et système

- Windows 10 ou Windows 11 64 bits.
- Compte Windows administrateur pour l’installation.
- PC serveur fiable avec espace disque disponible.
- Onduleur recommandé pour le serveur et les équipements réseau.
- Réseau privé stable, filaire de préférence pour le serveur.
- Routeur permettant une réservation DHCP.

### Logiciels

- PostgreSQL sur le serveur ; le déploiement actuel est validé avec PostgreSQL 18.
- Outils `psql` et éventuellement pgAdmin.
- Installeur MedCareSO 2.1.1.
- Inno Setup seulement sur le poste qui construit l’installeur, pas chez le client.
- Node.js n’est pas requis sur un PC client utilisant l’installeur final.

### Fichiers nécessaires

- Installeur MedCareSO.
- `SETUP_WINDOWS/SCRIPT_POSTGRESQL_COMPLET.sql`.
- Protocole de migration si le cabinet utilise un ancien système.
- Fiche de remise et procédure de sauvegarde.

---

## 5. Préparation du réseau

1. Choisir le PC serveur.
2. Donner au serveur un nom Windows clair, par exemple `MEDCARESO-SRV`.
3. Connecter le serveur au réseau privé du cabinet.
4. Exécuter `ipconfig` et relever l’adresse IPv4 et le masque.
5. Réserver cette IPv4 dans le routeur par DHCP.
6. Vérifier que les postes clients sont dans le même sous-réseau.
7. Vérifier que le Wi-Fi invité ou l’isolation des clients n’est pas utilisé pour les téléphones patients.
8. Noter l’adresse dans la fiche d’installation.

Exemple documentaire :

```text
Serveur : 192.168.1.86
Masque : 255.255.255.0
Sous-réseau : 192.168.1.0/24
```

Cet exemple doit être remplacé par les valeurs réelles du cabinet.

---

## 6. Installation de PostgreSQL

### 6.1 Installer PostgreSQL

1. Installer PostgreSQL sur le PC serveur.
2. Conserver le port 5432 sauf conflit documenté.
3. Choisir un mot de passe administrateur fort et unique.
4. Installer les outils en ligne de commande.
5. Ouvrir `services.msc`.
6. Vérifier que le service PostgreSQL est en cours d’exécution et en démarrage automatique.

Le nom exact du service dépend de la version, par exemple `postgresql-x64-18`.

### 6.2 Créer la base et le rôle applicatif

Depuis un terminal autorisé :

```powershell
psql -U postgres -f "SETUP_WINDOWS\SCRIPT_POSTGRESQL_COMPLET.sql"
```

Le script :

- demande le mot de passe du rôle applicatif ;
- crée ou met à jour `cabinet_app` ;
- crée `cabinet_db` si nécessaire ;
- attribue la base au rôle applicatif ;
- accorde les privilèges requis sur le schéma public.

Le mot de passe doit être propre au cabinet. Ne pas reprendre une valeur d’exemple trouvée dans le code ou dans une capture.

### 6.3 Vérification locale

```powershell
psql -h 127.0.0.1 -U cabinet_app -d cabinet_db -c "SELECT current_database(), current_user;"
```

Résultat attendu : `cabinet_db` et `cabinet_app`.

---

## 7. Autorisation du réseau PostgreSQL

### 7.1 postgresql.conf

Autoriser PostgreSQL à écouter sur l’interface réseau :

```text
listen_addresses = '*'
```

Une politique plus stricte peut utiliser uniquement `127.0.0.1` et l’IPv4 réservée du serveur.

### 7.2 pg_hba.conf

Ajouter une règle limitée à la base, au rôle et au sous-réseau réels :

```text
host    cabinet_db    cabinet_app    192.168.1.0/24    scram-sha-256
```

Interdictions :

- ne pas utiliser `0.0.0.0/0` ;
- ne pas exposer PostgreSQL directement sur Internet ;
- ne pas autoriser `cabinet_app` à administrer la base système `postgres`.

### 7.3 Pare-feu Windows

Créer une règle entrante :

- protocole TCP ;
- port local 5432 ;
- profil Privé ;
- adresse distante limitée au sous-réseau du cabinet.

Redémarrer PostgreSQL après la configuration.

### 7.4 Test depuis un client

```powershell
Test-NetConnection IP_SERVEUR -Port 5432
```

Résultat attendu : `TcpTestSucceeded : True`.

---

## 8. Installation du PC serveur

1. Vérifier la provenance et la version de l’installeur.
2. Lancer l’installeur avec les droits administrateur.
3. Choisir **PC serveur / principal**.
4. Renseigner :
   - hôte : `127.0.0.1` ;
   - port : `5432` ;
   - base : `cabinet_db` ;
   - utilisateur : `cabinet_app` ;
   - mot de passe : secret du cabinet.
5. Continuer uniquement si le test de connexion réussit.
6. Lancer MedCareSO.
7. Attendre la fin des migrations PostgreSQL.
8. Vérifier l’affichage de l’écran de connexion.

L’installeur écrit la configuration dans le dossier utilisateur de l’application. Ce fichier contient un secret et ne doit pas être envoyé par messagerie non sécurisée.

### Blocage Windows

En production, utiliser un installeur signé. Si Smart App Control ou SmartScreen bloque le fichier, vérifier son origine et son empreinte avant d’appliquer la procédure informatique approuvée. Ne pas conseiller de désactiver durablement les protections Windows.

---

## 9. Première configuration de MedCareSO

### 9.1 Administrateur

- Se connecter avec l’identifiant remis séparément.
- Modifier tout mot de passe temporaire.
- Ne pas conserver les identifiants de production dans le dépôt Git.

### 9.2 Licence

- Activer une licence au niveau de la base du cabinet.
- Une seule licence est active à la fois.
- Tous les postes utilisant cette base partagent la licence.
- La licence illimitée ne doit avoir aucune expiration et aucun identifiant de machine.
- La migration `005_seed_system_licenses.sql` crée et répare les clés système.

### 9.3 Comptes

- Créer un compte nominatif pour chaque médecin et assistant.
- Attribuer le rôle et la spécialité corrects.
- Tester les permissions.
- Éviter les comptes partagés.

#### Organisation des patients selon la structure

Le nombre maximal de médecins configuré dans le package détermine le mode de travail. Le comportement doit être vérifié avant la remise au client.

**Médecin seul, sans assistant**

- Une seule liste de patients est affichée.
- Le médecin crée, consulte et modifie directement ses patients.
- Aucun sélecteur de médecin et aucun répertoire global ne sont affichés.
- Les patients historiques sont automatiquement rattachés à l’unique médecin.

**Un médecin avec un ou plusieurs assistants**

- Le médecin et les assistants utilisent la même liste de patients.
- L’assistant n’a pas à sélectionner le médecin puisqu’il n’en existe qu’un.
- Aucun répertoire global et aucune séparation supplémentaire ne sont affichés.
- L’assistant peut gérer les informations administratives selon ses permissions, sans obtenir les droits médicaux du médecin.

**Cabinet avec plusieurs médecins et assistants**

- Chaque médecin ouvre par défaut **Mes patients** et ne voit que les dossiers qui lui sont rattachés.
- L’assistant choisit une seule fois le médecin pour lequel il travaille ; la liste, la recherche et les modifications suivent ce choix.
- Le **Répertoire global** est disponible uniquement dans ce mode cabinet.
- Le répertoire global montre uniquement les informations d’identité nécessaires à la recherche, pas le contenu clinique.
- Un patient déjà présent est ajouté à la liste d’un autre médecin sans recréer son identité.
- Un même patient peut être rattaché à plusieurs médecins, mais chaque médecin conserve son propre historique de consultations.
- L’action **Retirer de ma liste** enlève seulement le rattachement au médecin courant ; elle ne supprime pas le dossier global.
- La désactivation temporaire d’un médecin ne doit pas transférer automatiquement ses patients aux autres médecins.

Le répertoire global et le rattachement multiple doivent être bloqués côté interface et côté application lorsque la configuration autorise un seul médecin.

### 9.4 Cabinet

Configurer :

- nom et coordonnées ;
- horaires ;
- médecin responsable ;
- spécialité ;
- logo et informations des documents ;
- imprimante A4 ;
- imprimante thermique si utilisée ;
- scanner ;
- paramètres SMS uniquement si le service est disponible.

---

## 10. Installation des postes clients

Pour chaque poste :

1. Vérifier l’accès au serveur avec `Test-NetConnection`.
2. Lancer exactement la même version de l’installeur.
3. Choisir **PC client**.
4. Entrer l’IPv4 réservée du serveur.
5. Utiliser le port 5432, la base `cabinet_db` et le rôle `cabinet_app`.
6. Tester puis sauvegarder la connexion.
7. Se connecter avec un compte nominatif.
8. Vérifier que la licence est reconnue.
9. Créer une donnée de test depuis un poste.
10. Vérifier qu’elle apparaît immédiatement sur un autre poste.
11. Supprimer la donnée de test.

Tous les postes doivent être mis à jour ensemble. Une différence de version peut produire des erreurs de licence, de base ou d’interface.

---

## 11. Portail patient et QR code

### Activation

1. Sur le serveur, ouvrir **Paramètres > RDV**.
2. Activer le portail patient.
3. Conserver le port 4580 ou documenter le nouveau port.
4. Laisser l’URL publique vide pour un portail local.
5. Activer le QR code.
6. Enregistrer.
7. Imprimer ou afficher le QR.

### Test fonctionnel

1. Connecter un téléphone au même Wi-Fi privé.
2. Scanner le QR.
3. Vérifier que la page s’ouvre.
4. Tester une arrivée avec rendez-vous.
5. Tester une arrivée sans rendez-vous.
6. Vérifier l’arrivée automatique dans la salle d’attente.
7. Vérifier l’ordre de passage côté patient.
8. Supprimer les données de test.

### Confidentialité

Le portail ne doit jamais exposer le diagnostic, le téléphone ou les informations médicales des autres patients. Utiliser un numéro de ticket ou une information minimale pour l’ordre de passage.

### Disponibilité

Pour un portail local intégré, le PC serveur et MedCareSO doivent rester actifs. Le téléphone doit utiliser la bonne adresse IPv4 et le même réseau privé.

---

## 12. Sauvegardes

### Principe

Une sauvegarde doit être :

- quotidienne ;
- automatique ;
- vérifiée ;
- chiffrée lorsqu’elle quitte le serveur ;
- copiée sur un deuxième support ;
- restaurée périodiquement dans un environnement de test.

### Exemple pg_dump

```powershell
pg_dump -h 127.0.0.1 -U cabinet_app -F c -f "D:\MedCareSO_Backups\cabinet_db_YYYY-MM-DD.backup" cabinet_db
```

Le mot de passe ne doit pas être écrit en clair dans un script partagé. Utiliser une méthode sécurisée adaptée à l’environnement Windows.

### Politique à documenter

| Mesure | Décision du cabinet |
|---|---|
| Heure de sauvegarde | |
| Dossier local | |
| Deuxième copie | |
| Chiffrement | |
| Rétention journalière | |
| Rétention hebdomadaire | |
| Rétention mensuelle | |
| Responsable | |
| Dernier test de restauration | |

Une sauvegarde jamais restaurée n’est pas une sauvegarde prouvée.

---

## 13. Recette finale

| Test | Résultat | Observation |
|---|---|---|
| Redémarrage du serveur | ☐ Conforme | |
| Service PostgreSQL automatique | ☐ Conforme | |
| Connexion MedCareSO serveur | ☐ Conforme | |
| Connexion de chaque client | ☐ Conforme | |
| Donnée visible sur deux postes | ☐ Conforme | |
| Licence reconnue partout | ☐ Conforme | |
| Comptes et permissions | ☐ Conforme | |
| Médecin seul : liste simple sans répertoire global | ☐ Conforme | |
| Médecin + assistant : liste commune sans double sélection | ☐ Conforme | |
| Cabinet : séparation de chaque médecin | ☐ Conforme | |
| Cabinet : répertoire global et rattachement sans doublon | ☐ Conforme | |
| Retrait d’une liste sans suppression du dossier global | ☐ Conforme | |
| Impression A4 | ☐ Conforme | |
| Impression thermique | ☐ Conforme | |
| Numérisation scanner | ☐ Conforme | |
| QR avec rendez-vous | ☐ Conforme | |
| QR sans rendez-vous | ☐ Conforme | |
| Ordre de salle d’attente | ☐ Conforme | |
| Sauvegarde créée | ☐ Conforme | |
| Restauration de test | ☐ Conforme | |

La mise en service est autorisée uniquement lorsque les contrôles critiques sont conformes.

---

## 14. Dépannage

| Symptôme | Cause probable | Action recommandée |
|---|---|---|
| Timeout PostgreSQL | IP, service, port ou pare-feu | Tester 5432, vérifier le service, l’IPv4 et la règle Privé |
| `no pg_hba.conf entry` | Sous-réseau non autorisé | Ajouter une règle limitée à `cabinet_db`, `cabinet_app` et au sous-réseau réel |
| Erreur sur la base `postgres` | Ancienne version ou mauvaise configuration | Mettre à jour tous les postes, utiliser uniquement `cabinet_db` |
| Test réussi mais sauvegarde de configuration impossible | Ancienne version installée | Réinstaller la même version que le serveur |
| Identifiants utilisateur incorrects | Mauvaise base ou compte absent | Vérifier la configuration PostgreSQL et le compte dans la base partagée |
| Licence différente entre deux PC | Versions différentes ou bases différentes | Vérifier version, hôte et nom de base sur les deux postes |
| Licence illimitée absente | Migration de clés non appliquée | Appliquer les migrations, vérifier la version 5 dans `schema_migrations` |
| QR inaccessible | Serveur arrêté, mauvaise IP, Wi-Fi isolé ou port bloqué | Ouvrir MedCareSO sur le serveur et vérifier réseau/pare-feu |
| Application Electron se ferme | `ELECTRON_RUN_AS_NODE=1` | Supprimer la variable utilisateur et relancer |
| Windows bloque l’installeur | Fichier non signé | Vérifier la source et distribuer un installeur signé |

Commande de correction Electron :

```powershell
$env:ELECTRON_RUN_AS_NODE
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'User')
```

---

## 15. Remise au cabinet

Remettre au responsable autorisé :

- nom et IPv4 du serveur ;
- version de MedCareSO ;
- nom de la base et port PostgreSQL ;
- mots de passe dans un canal séparé et sécurisé ;
- copie vérifiée de l’installeur ;
- empreinte SHA-256 si disponible ;
- QR du portail ;
- emplacement et politique des sauvegardes ;
- procédure de restauration ;
- contact support ;
- rapport de recette signé.

### Signatures

| Validation | Nom, date et signature |
|---|---|
| Installateur | |
| Responsable du cabinet | |

---

## 16. Exigences de présentation du futur document

Le guide professionnel généré à partir de ce dossier doit :

- utiliser une couverture sobre avec le titre, la version et la date ;
- comporter un sommaire ;
- utiliser une palette médicale bleu, vert et gris ;
- afficher un schéma simple de l’architecture serveur/client/téléphone ;
- transformer les commandes en blocs techniques lisibles ;
- utiliser des encadrés distincts pour Information, Résultat attendu, Attention et Sécurité ;
- conserver les tableaux de préparation, recette, sauvegarde et remise ;
- ajouter des emplacements de capture sans inventer de capture ;
- utiliser des en-têtes, pieds de page et numéros de page ;
- produire un document A4 imprimable ;
- éviter les longues pages de texte compact ;
- ne contenir aucun mot de passe réel ni clé de licence ;
- ne pas inventer de fonction absente de cette source.

### Emplacements de captures suggérés

1. Choix du type de poste dans l’installeur.
2. Écran de connexion PostgreSQL de l’installeur.
3. Paramètres de licence.
4. Gestion des comptes.
5. Configuration du portail patient.
6. QR affiché dans MedCareSO.
7. Page d’arrivée vue depuis un téléphone.
8. Tableau de salle d’attente.
9. Écran de sauvegarde.

Si les images ne sont pas fournies, le document doit afficher un cadre discret portant la mention « Capture à insérer » plutôt que de créer une fausse interface.
