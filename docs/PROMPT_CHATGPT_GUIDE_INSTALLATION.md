# Prompt prêt à utiliser avec ChatGPT

Joindre le fichier `SOURCE_GUIDE_INSTALLATION_PROFESSIONNEL.md`, puis copier le prompt ci-dessous.

---

## Prompt

Tu es un expert en documentation technique, déploiement Windows, PostgreSQL et logiciels de gestion médicale.

À partir du fichier source joint, crée un guide d’installation professionnel en français pour MedCareSO 2.1.1.

### Objectif

Produire un fichier Word `.docx` destiné à un installateur informatique qui déploie MedCareSO dans un cabinet médical, depuis la préparation du réseau jusqu’à la recette et la remise au client.

### Contraintes factuelles

- Utilise uniquement les informations du fichier source.
- Ne réintroduis pas MariaDB ou SQLite : le logiciel actuel utilise PostgreSQL.
- Ne crée aucun mot de passe, aucune clé de licence et aucune donnée patient.
- Conserve les noms techniques `cabinet_db`, `cabinet_app`, les ports 5432 et 4580.
- Présente les adresses IP uniquement comme exemples à remplacer.
- Ne prétends pas que PostgreSQL est créé automatiquement par l’installeur.
- Explique clairement la différence entre PC serveur et PC client.
- Indique que la licence est partagée au niveau de la base du cabinet.
- Indique que le serveur et MedCareSO doivent rester actifs pour le portail patient local.

### Structure obligatoire

1. Couverture.
2. Sommaire.
3. Objectifs et périmètre.
4. Architecture cible.
5. Nouveau cabinet ou migration existante.
6. Prérequis.
7. Préparation du réseau.
8. Installation et configuration de PostgreSQL.
9. Installation du PC serveur.
10. Première configuration, comptes et licence.
11. Installation des postes clients.
12. Portail patient et QR code.
13. Périphériques.
14. Sauvegardes et restauration.
15. Recette finale.
16. Dépannage.
17. Remise et signatures.

### Design demandé

- Format A4 avec marges régulières.
- Style médical professionnel, moderne et sobre.
- Palette bleu foncé, bleu clair, vert médical et gris.
- Titres hiérarchisés et facilement repérables.
- En-tête avec « MedCareSO 2.1.1 — Guide d’installation ».
- Pied de page avec numéro de page et niveau de confidentialité.
- Tableaux avec ligne d’en-tête répétée sur les nouvelles pages.
- Encadrés visuels : Information, Résultat attendu, Attention, Sécurité.
- Commandes dans une police monospace.
- Cases à cocher pour la recette.
- Zones à remplir pour les informations du cabinet et les signatures.
- Schéma natif et modifiable montrant serveur, base PostgreSQL, clients et téléphone.

### Captures d’écran

Si aucune capture n’est jointe, n’invente pas d’image. Ajoute seulement des cadres « Capture à insérer » aux emplacements indiqués dans la source.

### Qualité attendue

- Corrige la grammaire et les accents.
- Évite les répétitions.
- Utilise des phrases courtes et opérationnelles.
- Conserve les avertissements de sécurité.
- Vérifie qu’aucun tableau ou encadré n’est coupé de manière illisible.
- Génère le DOCX, rends-le en images ou PDF pour le contrôler visuellement, corrige les défauts puis fournis uniquement le DOCX final.

Nom du fichier final :

```text
Guide_Professionnel_Installation_MedCareSO_2.1.1.docx
```

---

Avant de terminer, contrôle que le document permet réellement à une personne autorisée d’installer un serveur, connecter un poste client, tester le QR, vérifier la licence et valider une sauvegarde sans consulter une autre source.
