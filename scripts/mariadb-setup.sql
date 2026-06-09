-- ============================================================
-- Script d'installation MariaDB pour PhysioCare
-- À exécuter sur le PC SERVEUR uniquement
-- ============================================================

-- 1. Créer la base de données
CREATE DATABASE IF NOT EXISTS physiocare 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

-- 2. Sélectionner la base
USE physiocare;

-- 3. Créer l'utilisateur avec accès réseau (depuis n'importe quel PC)
-- ⚠️ CHANGEZ LE MOT DE PASSE CI-DESSOUS!
CREATE USER IF NOT EXISTS 'physiocare_user'@'%' 
  IDENTIFIED BY 'PhysioCare2024!';

CREATE USER IF NOT EXISTS 'physiocare_user'@'localhost' 
  IDENTIFIED BY 'PhysioCare2024!';

-- 4. Donner tous les droits à l'utilisateur sur la base
GRANT ALL PRIVILEGES ON physiocare.* TO 'physiocare_user'@'%';
GRANT ALL PRIVILEGES ON physiocare.* TO 'physiocare_user'@'localhost';

-- 5. Appliquer les changements
FLUSH PRIVILEGES;

-- ============================================================
-- TABLES REQUISES - À exécuter si les tables n'existent pas
-- ============================================================

-- Table des kinésithérapeutes (personnel)
CREATE TABLE IF NOT EXISTS kine_staff (
  id VARCHAR(36) PRIMARY KEY,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  specialty VARCHAR(100) DEFAULT 'Général',
  sessionPrice DECIMAL(10,2) DEFAULT 1500,
  sessionDuration INT DEFAULT 30,
  isActive BOOLEAN DEFAULT TRUE,
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des séances kiné
CREATE TABLE IF NOT EXISTS kine_sessions (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  kineId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  sessionDate DATETIME NOT NULL,
  sessionNumber INT DEFAULT 1,
  duration INT DEFAULT 30,
  price DECIMAL(10,2) DEFAULT 0,
  paymentStatus VARCHAR(30) DEFAULT 'unpaid',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des actes de consultation
CREATE TABLE IF NOT EXISTS consultation_acts (
  id VARCHAR(36) PRIMARY KEY,
  consultationId VARCHAR(36) NOT NULL,
  actType VARCHAR(100) NOT NULL,
  quantity INT DEFAULT 1,
  price DECIMAL(10,2) DEFAULT 0,
  kineId VARCHAR(36),
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des notifications utilisateurs
CREATE TABLE IF NOT EXISTS user_notifications (
  id VARCHAR(36) PRIMARY KEY,
  fromUserId VARCHAR(36),
  toUserId VARCHAR(36),
  toRole VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  patientId VARCHAR(36),
  relatedType VARCHAR(50),
  relatedId VARCHAR(36),
  data LONGTEXT,
  isRead BOOLEAN DEFAULT FALSE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================

-- 6. Vérifier que tout est OK
SELECT 'Base de données créée avec succès!' AS Status;
SELECT user, host FROM mysql.user WHERE user='physiocare_user';

-- ============================================================
-- Informations de connexion à noter:
-- ============================================================
-- Utilisateur: physiocare_user
-- Mot de passe: PhysioCare2024!
-- Base: physiocare
-- Port: 3306
-- ============================================================
