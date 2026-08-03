# MedCareSO - Fonctionnalités et Rôles

Ce document présente l'ensemble des fonctionnalités du logiciel MedCareSO (PhysioCare / MedPro), réparties selon les différents rôles utilisateurs. Le logiciel est conçu pour être simple, professionnel et adapté aux besoins du cabinet médical.

## 1. Rôles Utilisateurs

1. **Super Admin** : Gestionnaire technique, responsable des licences, de l'installation, et de la configuration globale.
2. **Médecin (Admin)** : Praticien principal. A accès à l'ensemble du dossier médical, des consultations, et des statistiques financières.
3. **Assistant(e) / Secrétaire** : Personnel d'accueil. Gère les rendez-vous, la salle d'attente, les informations administratives des patients, et les encaissements.

---

## 2. Répartition des Fonctionnalités par Rôle

### 👤 Rôle : Assistant(e) / Secrétaire

L'Assistant(e) est le premier point de contact du cabinet. Ses fonctionnalités sont axées sur l'accueil et l'administration :

* **Gestion des Patients (Administratif)** :
  * Création et mise à jour de la fiche patient.
  * Recherche rapide d'un patient.
* **Gestion des Rendez-vous et de l'Agenda** :
  * Création, modification et annulation de rendez-vous.
  * Vue jour, semaine et mois du planning du cabinet.
  * Impression des tickets de rendez-vous.
* **Salle d'Attente** :
  * Gestion de la file d'attente.
  * Visualisation des patients en attente et suivi du flux.
* **Communication Patient** :
  * Envoi automatique de SMS (confirmation et rappel de rendez-vous).
* **Paiements et Facturation (Base)** :
  * Enregistrement des paiements des patients.
  * Génération de factures et de reçus.

---

### 🩺 Rôle : Médecin (Praticien)

Le Médecin dispose de toutes les fonctionnalités de l'Assistant(e), avec en plus un accès complet au volet clinique et au pilotage du cabinet :

* **Tableau de Bord du Cabinet** :
  * Vue rapide sur l'activité (nombre de patients, consultations, ordonnances).
  * Résumé de la journée (horaires, motifs, diagnostics).
* **Dossier Médical Patient** :
  * Accès complet à l'historique clinique, documents, lettres d'orientation.
* **Consultations** :
  * Enregistrement des nouvelles consultations (motifs, constantes, examen clinique, diagnostic, notes).
* **Ordonnances et Prescriptions** :
  * Création et impression d'ordonnances personnalisées depuis le dossier.
  * Prescription d'analyses biologiques et examens.
* **Certificats et Rapports** :
  * Rédaction de certificats médicaux, arrêts de travail, et rapports personnalisés.
* **Imagerie Médicale** :
  * Intégration et consultation d'examens (Radiographie, IRM, Scanner CT, Échographie).
* **Modules de Spécialité (Selon licence)** :
  * *Rééducation / MPR* : Bilans fonctionnels, plans de rééducation, suivi.
  * *Dentaire* : Schéma dentaire, suivi des traitements.
  * *Cardiologie, Dermatologie, Gynécologie, etc.* : Profils et formulaires spécialisés.
* **Statistiques et Gestion Financière** :
  * Suivi détaillé des montants réglés et impayés.
  * Suivi de l'activité globale pour le pilotage financier du cabinet.

---

### ⚙️ Rôle : Super Admin

Le Super Admin gère les paramètres techniques inaccessibles aux utilisateurs standards :

* **Configuration Système** :
  * Configuration de la base de données (MariaDB) et des accès réseau (Client/Serveur).
* **Gestion des Licences** :
  * Activation des clés de licence (ex: Essai 7 jours, Illimitée).
  * Activation dynamique des modules de spécialités (pour réduire la consommation de RAM/CPU).
* **Gestion des Utilisateurs** :
  * Création et gestion des comptes utilisateurs (Médecins, Assistants) et attribution des permissions.
* **Maintenance** :
  * Mises à jour de l'application, gestion des sauvegardes et supervision des services en arrière-plan.

---
*Généré pour MedCareSO - Architecture Modulaire et Professionnelle.*
