-- ============================================================
-- 🏥 PHYSIOCARE - SCRIPT SQL COMPLET POUR WINDOWS
-- ============================================================
-- À exécuter sur le PC SERVEUR avec HeidiSQL
-- Version: 1.0.0 - Janvier 2026
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- ÉTAPE 1: CRÉER LA BASE DE DONNÉES
-- ═══════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS physiocare 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE physiocare;

-- ═══════════════════════════════════════════════════════════
-- ÉTAPE 2: CRÉER L'UTILISATEUR
-- ═══════════════════════════════════════════════════════════

CREATE USER IF NOT EXISTS 'physiocare_user'@'%' 
  IDENTIFIED BY 'PhysioCare2024!';

CREATE USER IF NOT EXISTS 'physiocare_user'@'localhost' 
  IDENTIFIED BY 'PhysioCare2024!';

GRANT ALL PRIVILEGES ON physiocare.* TO 'physiocare_user'@'%';
GRANT ALL PRIVILEGES ON physiocare.* TO 'physiocare_user'@'localhost';

FLUSH PRIVILEGES;

-- ═══════════════════════════════════════════════════════════
-- ÉTAPE 3: CRÉER TOUTES LES TABLES
-- ═══════════════════════════════════════════════════════════

-- Table des licences
CREATE TABLE IF NOT EXISTS licenses (
  id VARCHAR(36) PRIMARY KEY,
  `key` VARCHAR(50) UNIQUE NOT NULL,
  clientName VARCHAR(255) NOT NULL,
  generatedDate DATETIME NOT NULL,
  expirationDate DATE,
  activated BOOLEAN DEFAULT FALSE,
  activationDate DATETIME,
  machineId VARCHAR(64),
  status VARCHAR(20) DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(64) NOT NULL,
  fullName VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  role ENUM('admin', 'director', 'doctor', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse', 'assistant') DEFAULT 'doctor',
  specialty VARCHAR(100),
  color VARCHAR(20) DEFAULT '#3b82f6',
  isAdmin BOOLEAN DEFAULT FALSE,
  isSuperAdmin BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastLogin DATETIME,
  resetCode VARCHAR(10),
  resetCodeExpiry DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des paramètres du cabinet
CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(36) PRIMARY KEY,
  cabinetName VARCHAR(255),
  cabinetAddress TEXT,
  cabinetPhone VARCHAR(50),
  cabinetEmail VARCHAR(255),
  doctorName VARCHAR(255),
  doctorRPPS VARCHAR(50),
  doctorSpecialty VARCHAR(100),
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des patients
CREATE TABLE IF NOT EXISTS patients (
  id VARCHAR(36) PRIMARY KEY,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  dateOfBirth DATE,
  gender VARCHAR(20),
  socialSecurityNumber VARCHAR(50) UNIQUE,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  zipCode VARCHAR(20),
  bloodType VARCHAR(10),
  allergies TEXT,
  medicalHistory TEXT,
  emergencyContact VARCHAR(255),
  emergencyPhone VARCHAR(50),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des consultations
CREATE TABLE IF NOT EXISTS consultations (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationDate DATETIME NOT NULL,
  consultationType VARCHAR(50),
  reason TEXT,
  anamnesis TEXT,
  clinicalExamination TEXT,
  bloodPressure VARCHAR(20),
  temperature DECIMAL(4,1),
  weight DECIMAL(5,2),
  height DECIMAL(5,2),
  imc DECIMAL(4,2),
  diagnosis TEXT,
  cim10Code VARCHAR(20),
  treatment TEXT,
  advice TEXT,
  notes TEXT,
  attachments LONGTEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des ordonnances
CREATE TABLE IF NOT EXISTS prescriptions (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  prescriptionDate DATETIME NOT NULL,
  medications LONGTEXT,
  notes TEXT,
  generatedPDF LONGBLOB,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des arrêts de travail
CREATE TABLE IF NOT EXISTS sick_leaves (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  numberOfDays INT,
  diagnosis TEXT,
  cim10Code VARCHAR(20),
  allowedOutings BOOLEAN DEFAULT FALSE,
  generatedPDF LONGBLOB,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des rendez-vous
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  appointmentDateTime DATETIME NOT NULL,
  appointmentType VARCHAR(50),
  reason TEXT,
  status VARCHAR(30) DEFAULT 'scheduled',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des factures
CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  invoiceDate DATE NOT NULL,
  consultationId VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(30) DEFAULT 'pending',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des documents médicaux
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  documentType VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  payload LONGTEXT,
  lastPrintedAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des paiements
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  paymentDate DATE NOT NULL,
  paymentMethod VARCHAR(50) DEFAULT 'Espèces',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table du journal d'activité
CREATE TABLE IF NOT EXISTS activity_log (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  tableName VARCHAR(50),
  recordId VARCHAR(36),
  details TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des modèles d'ordonnances
CREATE TABLE IF NOT EXISTS prescription_templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  medications LONGTEXT NOT NULL,
  notes TEXT,
  category VARCHAR(100) DEFAULT 'Général',
  usageCount INT DEFAULT 0,
  createdBy VARCHAR(36),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des médicaments
CREATE TABLE IF NOT EXISTS medications (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  genericName VARCHAR(255),
  category VARCHAR(100),
  dosageForm VARCHAR(100),
  defaultDosage VARCHAR(255),
  defaultIntake VARCHAR(255),
  defaultDuration VARCHAR(100),
  defaultBoxes VARCHAR(50),
  instructions TEXT,
  contraindications TEXT,
  sideEffects TEXT,
  isActive BOOLEAN DEFAULT TRUE,
  usageCount INT DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des analyses médicales
CREATE TABLE IF NOT EXISTS medical_analyses (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  analysisDate DATETIME NOT NULL,
  analysisType VARCHAR(100) NOT NULL,
  laboratory VARCHAR(255),
  results LONGTEXT,
  normalValues TEXT,
  interpretation TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  attachmentPath VARCHAR(500),
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des dépenses
CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(36) PRIMARY KEY,
  expenseDate DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL,
  paymentMethod VARCHAR(50) DEFAULT 'Espèces',
  vendor VARCHAR(255),
  receiptNumber VARCHAR(100),
  notes TEXT,
  createdBy VARCHAR(36),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table de l'inventaire
CREATE TABLE IF NOT EXISTS inventory (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) DEFAULT 'Général',
  description TEXT,
  quantity INT DEFAULT 0,
  minQuantity INT DEFAULT 5,
  unit VARCHAR(50) DEFAULT 'unité',
  purchasePrice DECIMAL(10,2) DEFAULT 0,
  sellingPrice DECIMAL(10,2) DEFAULT 0,
  supplier VARCHAR(255),
  expirationDate DATE,
  location VARCHAR(255),
  notes TEXT,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des mouvements de stock
CREATE TABLE IF NOT EXISTS inventory_movements (
  id VARCHAR(36) PRIMARY KEY,
  inventoryId VARCHAR(36) NOT NULL,
  movementType VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  previousQuantity INT,
  newQuantity INT,
  reason TEXT,
  reference VARCHAR(100),
  createdBy VARCHAR(36),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE,
  FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des dettes / impayés
CREATE TABLE IF NOT EXISTS debts (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  invoiceId VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  paidAmount DECIMAL(10,2) DEFAULT 0,
  remainingAmount DECIMAL(10,2) NOT NULL,
  dueDate DATE,
  status VARCHAR(30) DEFAULT 'unpaid',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  relatedType VARCHAR(50),
  relatedId VARCHAR(36),
  isRead BOOLEAN DEFAULT FALSE,
  scheduledFor DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des documents patients
CREATE TABLE IF NOT EXISTS patient_documents (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  fileName VARCHAR(255) NOT NULL,
  fileType VARCHAR(100),
  filePath VARCHAR(500),
  fileSize INT,
  description TEXT,
  category VARCHAR(100) DEFAULT 'Autre',
  uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table waiting_room (salle d'attente)
CREATE TABLE IF NOT EXISTS waiting_room (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  appointmentId VARCHAR(36),
  arrivalTime DATETIME NOT NULL,
  status VARCHAR(30) DEFAULT 'waiting',
  priority INT DEFAULT 0,
  assignedTo VARCHAR(36),
  notes TEXT,
  calledAt DATETIME,
  startedAt DATETIME,
  completedAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY(assignedTo) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des forfaits de séances
CREATE TABLE IF NOT EXISTS patient_packages (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  packageName VARCHAR(255) NOT NULL,
  totalSessions INT NOT NULL,
  usedSessions INT DEFAULT 0,
  remainingSessions INT NOT NULL,
  pricePerSession DECIMAL(10,2) DEFAULT 0,
  totalPrice DECIMAL(10,2) DEFAULT 0,
  startDate DATE,
  expirationDate DATE,
  status VARCHAR(30) DEFAULT 'active',
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table de configuration du package client
CREATE TABLE IF NOT EXISTS package_config (
  id VARCHAR(36) PRIMARY KEY,
  cabinetName VARCHAR(255),
  cabinetAddress TEXT,
  cabinetPhone VARCHAR(50),
  cabinetEmail VARCHAR(255),
  cabinetLogo LONGTEXT,
  doctorName VARCHAR(255),
  doctorRPPS VARCHAR(50),
  doctorSpecialty VARCHAR(100),
  doctorSignature LONGTEXT,
  packageType VARCHAR(50) DEFAULT 'basic',
  maxUsers INT DEFAULT 1,
  features LONGTEXT,
  installationDate DATETIME,
  lastConfigUpdate DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════
-- TABLES KINÉ (IMPORTANTES - ÉTAIENT MANQUANTES!)
-- ═══════════════════════════════════════════════════════════

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
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(kineId) REFERENCES kine_staff(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
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
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE CASCADE,
  FOREIGN KEY(kineId) REFERENCES kine_staff(id) ON DELETE SET NULL
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
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(fromUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(toUserId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des plans de rééducation
CREATE TABLE IF NOT EXISTS rehabilitation_plans (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  consultationId VARCHAR(36),
  startDate DATE NOT NULL,
  endDate DATE,
  diagnosis TEXT,
  objectives TEXT,
  totalSessions INT DEFAULT 0,
  completedSessions INT DEFAULT 0,
  kinesiotherapy INT DEFAULT 0,
  kinesiotherapyFrequency VARCHAR(100),
  kinesiotherapyNotes TEXT,
  ergotherapy INT DEFAULT 0,
  ergotherapyFrequency VARCHAR(100),
  ergotherapyNotes TEXT,
  orthophony INT DEFAULT 0,
  orthophonyFrequency VARCHAR(100),
  orthophonyNotes TEXT,
  status VARCHAR(30) DEFAULT 'active',
  notes TEXT,
  generatedPDF LONGBLOB,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════
-- ÉTAPE 4: CRÉER LES INDEX
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_documents_patient_type ON documents(patientId, documentType);
CREATE INDEX IF NOT EXISTS idx_documents_consultation ON documents(consultationId);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(lastName, firstName);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(consultationDate);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointmentDateTime);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate);

-- ═══════════════════════════════════════════════════════════
-- ÉTAPE 5: CRÉER LE SUPER ADMIN
-- ═══════════════════════════════════════════════════════════

-- Mot de passe: MedPro@2024! (hashé en SHA256)
INSERT IGNORE INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive, createdAt) 
VALUES (
  UUID(), 
  'superadmin', 
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 
  'Super Administrateur', 
  'admin', 
  TRUE, 
  TRUE, 
  TRUE,
  NOW()
);

-- ═══════════════════════════════════════════════════════════
-- ÉTAPE 6: CRÉER LA LICENCE MASTER
-- ═══════════════════════════════════════════════════════════

INSERT IGNORE INTO licenses (id, `key`, clientName, generatedDate, activated, activationDate, status) 
VALUES (
  UUID(), 
  'MEDPRO-MASTER-2024-ACTIVATED', 
  'Licence Master', 
  NOW(), 
  TRUE, 
  NOW(), 
  'active'
);

-- ═══════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- ═══════════════════════════════════════════════════════════

SELECT '✅ Base de données physiocare créée avec succès!' AS Status;
SELECT COUNT(*) AS 'Nombre de tables créées' FROM information_schema.tables WHERE table_schema = 'physiocare';
SELECT user, host FROM mysql.user WHERE user = 'physiocare_user';

-- ============================================================
-- 🎉 INSTALLATION TERMINÉE!
-- ============================================================
-- 
-- Identifiants de connexion:
-- ─────────────────────────
-- Base de données: physiocare
-- Utilisateur DB:  physiocare_user
-- Mot de passe DB: PhysioCare2024!
-- Port:            3306
--
-- Super Admin PhysioCare:
-- ───────────────────────
-- Utilisateur: superadmin
-- Mot de passe: MedPro@2024!
--
-- ============================================================
