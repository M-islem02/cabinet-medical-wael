/**
 * Module de gestion de la base de donnÃ©es MariaDB/MySQL
 * Pour utilisation multi-postes (plusieurs PC)
 */

import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let pool = null;
let dbConfig = null;

function getHostCandidates(configHost) {
  const rawHost = (configHost || 'localhost').trim();
  const candidates = [];

  const pushUnique = (host) => {
    if (host && !candidates.includes(host)) {
      candidates.push(host);
    }
  };

  // Host saisi par l'utilisateur en prioritÃ©
  pushUnique(rawHost);

  // CompatibilitÃ© locale IPv4/IPv6
  if (rawHost === 'localhost') {
    pushUnique('127.0.0.1');
  } else if (rawHost === '127.0.0.1') {
    pushUnique('localhost');
  } else {
    // Si l'IP distante est indisponible, tenter aussi le serveur local
    pushUnique('127.0.0.1');
    pushUnique('localhost');
  }

  return candidates;
}

/**
 * Charge la configuration de la base de donnÃ©es
 */
function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'database-config.json');
  
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    // La config MariaDB est dans l'objet "mariadb"
    if (config.mariadb) {
      return config.mariadb;
    }
  }
  
  // Configuration par dÃ©faut
  return {
    host: 'localhost',
    port: 3306,
    user: 'physiocare_user',
    password: 'PhysioCare2024!',
    database: 'physiocare'
  };
}

/**
 * Sauvegarde la configuration de la base de donnÃ©es
 */
export function saveConfig(config) {
  const configPath = path.join(app.getPath('userData'), 'database-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  dbConfig = config;
}

/**
 * Initialise la connexion Ã  MariaDB
 */
export async function initializeDatabase() {
  try {
    dbConfig = loadConfig();

    const hostCandidates = getHostCandidates(dbConfig.host);
    const connectionErrors = [];
    let connectedHost = null;

    for (const host of hostCandidates) {
      let candidatePool = null;
      try {
        candidatePool = mysql.createPool({
          host,
          port: dbConfig.port,
          user: dbConfig.user,
          password: dbConfig.password,
          database: dbConfig.database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          charset: 'utf8mb4',
          connectTimeout: 7000,
          enableKeepAlive: true
        });

        const connection = await candidatePool.getConnection();
        connection.release();

        pool = candidatePool;
        connectedHost = host;
        break;
      } catch (error) {
        connectionErrors.push(`${host}: ${error.code || 'UNKNOWN'} - ${error.message}`);
        if (candidatePool) {
          try { await candidatePool.end(); } catch (_) {}
        }
      }
    }

    if (!pool) {
      const err = new Error(`Impossible de se connecter Ã  MariaDB (${connectionErrors.join(' | ')})`);
      err.code = 'MARIADB_CONNECT_FAILED';
      throw err;
    }

    if (connectedHost !== dbConfig.host) {
      console.warn(`Configured MariaDB host unavailable (${dbConfig.host}), connection succeeded via ${connectedHost}`);
    }

    console.log(`Connected to MariaDB: ${connectedHost}:${dbConfig.port}/${dbConfig.database}`);
    
    // CrÃ©er les tables
    await createTables();
    
    return pool;
  } catch (error) {
    console.error('MariaDB connection error:', error);
    throw error;
  }
}

/**
 * CrÃ©e toutes les tables nÃ©cessaires
 */
async function createTables() {
  // Table des licences
  await run(`
    CREATE TABLE IF NOT EXISTS licenses (
      id VARCHAR(36) PRIMARY KEY,
      \`key\` VARCHAR(50) UNIQUE NOT NULL,
      clientName VARCHAR(255) NOT NULL,
      generatedDate DATETIME NOT NULL,
      expirationDate DATETIME,
      activated BOOLEAN DEFAULT FALSE,
      activationDate DATETIME,
      machineId VARCHAR(64),
      status VARCHAR(20) DEFAULT 'pending'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des utilisateurs avec rÃ´le Ã©tendu
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(64) NOT NULL,
      fullName VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      role ENUM('admin', 'doctor', 'dentist', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse', 'assistant') DEFAULT 'doctor',
      specialty VARCHAR(100),
      color VARCHAR(20) DEFAULT '#3b82f6',
      isAdmin BOOLEAN DEFAULT FALSE,
      isSuperAdmin BOOLEAN DEFAULT FALSE,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastLogin DATETIME,
      resetCode VARCHAR(10),
      resetCodeExpiry DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des paramÃ¨tres du cabinet
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR(36) PRIMARY KEY,
      cabinetName VARCHAR(255),
      cabinetAddress TEXT,
      cabinetPhone VARCHAR(50),
      cabinetEmail VARCHAR(255),
      doctorName VARCHAR(255),
      doctorRPPS VARCHAR(50),
      doctorSpecialty VARCHAR(100),
      documentColorMode VARCHAR(20) DEFAULT 'color',
      documentPrimaryColor VARCHAR(20) DEFAULT '#1a8c7e',
      documentTypeColors LONGTEXT,
      documentTextScale INT DEFAULT 100,
      documentLogoScale INT DEFAULT 90,
      documentStyleVariant VARCHAR(20) DEFAULT 'classic',
      documentWatermarkOpacity INT DEFAULT 5,
      documentHideSignature BOOLEAN DEFAULT FALSE,
      preferredPrinter VARCHAR(255),
      preferredScanner VARCHAR(255),
      preferredThermalPrinter VARCHAR(255),
      publicBookingEnabled BOOLEAN DEFAULT FALSE,
      publicBookingPort INT DEFAULT 4580,
      publicBookingToken VARCHAR(255),
      publicBookingPublicUrl TEXT,
      publicBookingQrEnabled BOOLEAN DEFAULT TRUE,
      ownerUserId VARCHAR(36),
      cabinetLogoDataUrl LONGTEXT,
      cabinetWatermarkLogoDataUrl LONGTEXT,
      customTreatmentTypes LONGTEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des patients
  await run(`
    CREATE TABLE IF NOT EXISTS patients (
      id VARCHAR(36) PRIMARY KEY,
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      primaryDoctorId VARCHAR(36),
      createdByUserId VARCHAR(36),
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
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(primaryDoctorId) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(createdByUserId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des consultations
  await run(`
    CREATE TABLE IF NOT EXISTS consultations (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      doctorId VARCHAR(36),
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
      cim10Code TEXT,
      treatment TEXT,
      advice TEXT,
      notes TEXT,
      acts LONGTEXT,
      kineId VARCHAR(36),
      isUnpaid BOOLEAN DEFAULT FALSE,
      unpaidAmount DECIMAL(10,2) DEFAULT 0,
      unpaidDueDate DATE,
      attachments LONGTEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(doctorId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_consultations_patient_date ON consultations(patientId, consultationDate DESC)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor ON patients(primaryDoctorId)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_patients_created_by_user ON patients(createdByUserId)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctorId)`).catch(() => {});

  await run(`
    CREATE TABLE IF NOT EXISTS patient_attachments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      fileName VARCHAR(255) NOT NULL,
      filePath VARCHAR(500) NOT NULL,
      mimeType VARCHAR(255),
      fileSize BIGINT DEFAULT 0,
      examFamily VARCHAR(80) DEFAULT 'Document',
      sourceType VARCHAR(50) DEFAULT 'import',
      sourceLabel VARCHAR(255),
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des ordonnances
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_date ON prescriptions(patientId, prescriptionDate DESC)`).catch(() => {});

  // Table des arrÃªts de travail
  await run(`
    CREATE TABLE IF NOT EXISTS sick_leaves (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      startDate DATE NOT NULL,
      endDate DATE NOT NULL,
      numberOfDays INT,
      diagnosis TEXT,
      cim10Code TEXT,
      allowedOutings BOOLEAN DEFAULT FALSE,
      generatedPDF LONGBLOB,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_sick_leaves_patient_start ON sick_leaves(patientId, startDate DESC)`).catch(() => {});

  // Table des rendez-vous
  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      appointmentDateTime DATETIME NOT NULL,
      appointmentType VARCHAR(50),
      reason TEXT,
      status VARCHAR(30) DEFAULT 'scheduled',
      notes TEXT,
      bookingSource VARCHAR(30) DEFAULT 'manual',
      bookingCode VARCHAR(100),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des factures
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des documents mÃ©dicaux
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Index pour documents
  await run(`CREATE INDEX IF NOT EXISTS idx_documents_patient_type ON documents(patientId, documentType)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_documents_consultation ON documents(consultationId)`).catch(() => {});

  // Table des paiements
  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      amount DECIMAL(10,2) NOT NULL,
      paymentDate DATE NOT NULL,
      paymentMethod VARCHAR(50) DEFAULT 'EspÃ¨ces',
      description TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paymentDate DESC)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_payments_consultation ON payments(consultationId)`).catch(() => {});

  // Table du journal d'activitÃ©
  await run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id VARCHAR(36) PRIMARY KEY,
      userId VARCHAR(36),
      action VARCHAR(100) NOT NULL,
      tableName VARCHAR(50),
      recordId VARCHAR(36),
      details TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des modÃ¨les d'ordonnances
  await run(`
    CREATE TABLE IF NOT EXISTS prescription_templates (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      medications LONGTEXT NOT NULL,
      notes TEXT,
      category VARCHAR(100) DEFAULT 'GÃ©nÃ©ral',
      usageCount INT DEFAULT 0,
      createdBy VARCHAR(36),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des mÃ©dicaments
  await run(`
    CREATE TABLE IF NOT EXISTS medications (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des analyses mÃ©dicales
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des types d'analyses (catalogue)
  await run(`
    CREATE TABLE IF NOT EXISTS analysis_types (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) DEFAULT 'General',
      description TEXT,
      normalValues TEXT,
      unit VARCHAR(100),
      price DECIMAL(10,2) DEFAULT 0,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des dÃ©penses
  await run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(36) PRIMARY KEY,
      expenseDate DATE NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT,
      amount DECIMAL(10,2) NOT NULL,
      paymentMethod VARCHAR(50) DEFAULT 'EspÃ¨ces',
      vendor VARCHAR(255),
      receiptNumber VARCHAR(100),
      notes TEXT,
      createdBy VARCHAR(36),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table de l'inventaire
  await run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) DEFAULT 'GÃ©nÃ©ral',
      description TEXT,
      quantity INT DEFAULT 0,
      minQuantity INT DEFAULT 5,
      unit VARCHAR(50) DEFAULT 'unitÃ©',
      purchasePrice DECIMAL(10,2) DEFAULT 0,
      sellingPrice DECIMAL(10,2) DEFAULT 0,
      supplier VARCHAR(255),
      expirationDate DATE,
      location VARCHAR(255),
      notes TEXT,
      isActive BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des mouvements de stock
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des dettes / impayÃ©s
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des notifications
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS treatment_plans (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      startDate DATE NOT NULL,
      endDate DATE,
      sessions INT DEFAULT 1,
      completedSessions INT DEFAULT 0,
      frequency VARCHAR(100),
      status VARCHAR(50) DEFAULT 'active',
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS plan_payment_sessions (
      id VARCHAR(36) PRIMARY KEY,
      planId VARCHAR(36) NOT NULL,
      sessionNumber INT NOT NULL,
      scheduledDate DATETIME,
      paidDate DATETIME,
      expectedAmount DECIMAL(10,2) DEFAULT 0,
      paidAmount DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      notes TEXT,
      recordedBy VARCHAR(36),
      paymentId VARCHAR(36),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(planId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(recordedBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS plan_equipment_usage (
      id VARCHAR(36) PRIMARY KEY,
      planId VARCHAR(36) NOT NULL,
      inventoryId VARCHAR(36) NOT NULL,
      usageDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(planId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS treatment_sessions (
      id VARCHAR(36) PRIMARY KEY,
      treatmentPlanId VARCHAR(36) NOT NULL,
      sessionNumber INT NOT NULL,
      scheduledDate DATE NOT NULL,
      completedDate DATE,
      status VARCHAR(50) DEFAULT 'scheduled',
      therapistId VARCHAR(36),
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(treatmentPlanId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(therapistId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des documents patients
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table waiting_room (salle d'attente)
  await run(`
    CREATE TABLE IF NOT EXISTS waiting_room (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      appointmentId VARCHAR(36),
      arrivalTime DATETIME NOT NULL,
      reason VARCHAR(255),
      status VARCHAR(30) DEFAULT 'waiting',
      priority INT DEFAULT 0,
      assignedTo VARCHAR(36),
      notes TEXT,
      createdBy VARCHAR(36),
      calledAt DATETIME,
      startedAt DATETIME,
      completedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE SET NULL,
      FOREIGN KEY(assignedTo) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table des forfaits de sÃ©ances
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table de configuration du package client
  await run(`
    CREATE TABLE IF NOT EXISTS package_config (
      id VARCHAR(36) PRIMARY KEY,
      clientName VARCHAR(255) NOT NULL,
      packageType VARCHAR(50) DEFAULT 'basic',
      maxDoctors INT DEFAULT 1,
      maxAssistants INT DEFAULT 0,
      featurePrescriptions BOOLEAN DEFAULT TRUE,
      featureWaitingRoom BOOLEAN DEFAULT TRUE,
      featureDailySummary BOOLEAN DEFAULT TRUE,
      featureStatistics BOOLEAN DEFAULT TRUE,
      featureInventory BOOLEAN DEFAULT TRUE,
      featureKineStaff BOOLEAN DEFAULT FALSE,
      featureRehabilitation BOOLEAN DEFAULT FALSE,
      featureDentistry BOOLEAN DEFAULT FALSE,
      featureCardiology BOOLEAN DEFAULT FALSE,
      featureMedicalImaging BOOLEAN DEFAULT TRUE,
      activeSpecialty VARCHAR(40) DEFAULT 'general',
      enabledSpecialties TEXT,
      featureDebts BOOLEAN DEFAULT TRUE,
      featureCalendar BOOLEAN DEFAULT TRUE,
      featureDocuments BOOLEAN DEFAULT TRUE,
      featureSickLeaves BOOLEAN DEFAULT TRUE,
      featureMultiPC BOOLEAN DEFAULT FALSE,
      featureAiReports BOOLEAN DEFAULT FALSE,
      featureAiChatbot BOOLEAN DEFAULT FALSE,
      featureAfterSalesSupport BOOLEAN DEFAULT TRUE,
      priceDoctor DECIMAL(10,2) DEFAULT 60000,
      priceAssistant DECIMAL(10,2) DEFAULT 15000,
      pricePrescriptions DECIMAL(10,2) DEFAULT 0,
      priceMultiPC DECIMAL(10,2) DEFAULT 0,
      priceDentistry DECIMAL(10,2) DEFAULT 12000,
      priceCardiology DECIMAL(10,2) DEFAULT 12000,
      priceAiReports DECIMAL(10,2) DEFAULT 10000,
      priceAiChatbot DECIMAL(10,2) DEFAULT 8000,
      priceAfterSales DECIMAL(10,2) DEFAULT 0,
      totalPrice DECIMAL(10,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'DZD',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureMariaDBSchemaUpgrades();

  // Table for kinÃ© staff (kinÃ©sithÃ©rapeutes) - NOT user accounts
  await run(`
    CREATE TABLE IF NOT EXISTS kine_staff (
      id VARCHAR(36) PRIMARY KEY,
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      specialty VARCHAR(100) DEFAULT 'GÃ©nÃ©ral',
      sessionPrice DECIMAL(10,2) DEFAULT 1500,
      sessionDuration INT DEFAULT 30,
      isActive BOOLEAN DEFAULT TRUE,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table for kinÃ© sessions (linked to kine_staff)
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table for consultation acts
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Table for notifications between users
  await run(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ========== TABLES MPR / REEDUCATION ==========
  await run(`
    CREATE TABLE IF NOT EXISTS functional_evaluations (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      evaluationDate DATE NOT NULL,
      evaluatorId VARCHAR(36),

      autonomyScore INT,
      autonomyNotes TEXT,

      mobilityScore INT,
      mobilityNotes TEXT,
      walkingAbility VARCHAR(100),
      walkingAid VARCHAR(100),
      walkingDistance VARCHAR(255),

      balanceScore INT,
      balanceNotes TEXT,

      coordinationScore INT,
      coordinationNotes TEXT,

      painScore INT,
      painLocation TEXT,
      painType VARCHAR(100),
      painNotes TEXT,

      spasticityScore INT,
      spasticityLocation TEXT,
      spasticityNotes TEXT,
      jointRange TEXT,
      mrcScores LONGTEXT,

      globalAssessment VARCHAR(50),
      functionalDiagnosis TEXT,
      limitations TEXT,
      activityRestrictions TEXT,
      socialParticipation TEXT,

      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS clinical_exams (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      examDate DATE NOT NULL,
      examinerId VARCHAR(36),
      jointRanges LONGTEXT,
      muscleStrength LONGTEXT,
      muscleTone TEXT,
      posture TEXT,
      postureNotes TEXT,
      sensitivity TEXT,
      sensitivityNotes TEXT,
      reflexes TEXT,
      reflexNotes TEXT,
      gait TEXT,
      gaitNotes TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(examinerId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS medical_scales (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      evaluationId VARCHAR(36),
      evaluationDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      evaluatorId VARCHAR(36),
      scaleType VARCHAR(255) NOT NULL,
      score DOUBLE,
      maxScore DOUBLE,
      interpretation TEXT,
      details LONGTEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluationId) REFERENCES functional_evaluations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS rehabilitation_plans (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      createdBy VARCHAR(36),
      startDate DATE NOT NULL,
      endDate DATE,
      status VARCHAR(30) DEFAULT 'active',

      shortTermObjectives TEXT,
      mediumTermObjectives TEXT,
      longTermObjectives TEXT,

      kinesiotherapy INT DEFAULT 0,
      kinesiotherapyFrequency VARCHAR(255),
      kinesiotherapyNotes TEXT,

      ergotherapy INT DEFAULT 0,
      ergotherapyFrequency VARCHAR(255),
      ergotherapyNotes TEXT,

      speechTherapy INT DEFAULT 0,
      speechTherapyFrequency VARCHAR(255),
      speechTherapyNotes TEXT,

      orthosis BOOLEAN DEFAULT FALSE,
      orthosisType VARCHAR(255),
      orthosisNotes TEXT,

      wheelchair BOOLEAN DEFAULT FALSE,
      wheelchairType VARCHAR(255),
      wheelchairNotes TEXT,

      prosthesis BOOLEAN DEFAULT FALSE,
      prosthesisType VARCHAR(255),
      prosthesisNotes TEXT,

      otherEquipment LONGTEXT,
      equipmentDetails TEXT,

      hydrotherapy BOOLEAN DEFAULT FALSE,
      electrotherapy BOOLEAN DEFAULT FALSE,
      massotherapy BOOLEAN DEFAULT FALSE,

      totalSessions INT DEFAULT 0,
      completedSessions INT DEFAULT 0,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS rehabilitation_sessions (
      id VARCHAR(36) PRIMARY KEY,
      rehabilitationPlanId VARCHAR(36) NOT NULL,
      patientId VARCHAR(36) NOT NULL,
      therapistId VARCHAR(36),
      sessionDate DATETIME NOT NULL,
      sessionType VARCHAR(100),
      sessionNumber INT DEFAULT 1,
      duration INT DEFAULT 30,
      techniques LONGTEXT,
      exercises LONGTEXT,
      observations TEXT,
      progressNotes TEXT,
      painLevel INT,
      patientFeedback TEXT,
      status VARCHAR(30) DEFAULT 'scheduled',
      billedAmount DECIMAL(10,2) DEFAULT 0,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(rehabilitationPlanId) REFERENCES rehabilitation_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(therapistId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS patient_progress (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      evaluationDate DATETIME NOT NULL,
      evaluatorId VARCHAR(36),
      category VARCHAR(100),
      previousScore DOUBLE,
      currentScore DOUBLE,
      improvement TEXT,
      status VARCHAR(50),
      patientAdherence TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS patient_equipment (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      consultationId VARCHAR(36),
      prescribedBy VARCHAR(36),
      equipmentType VARCHAR(100) NOT NULL,
      equipmentName VARCHAR(255) NOT NULL,
      description TEXT,
      prescriptionDate DATE NOT NULL,
      deliveryDate DATE,
      supplier VARCHAR(255),
      status VARCHAR(50) DEFAULT 'prescribed',
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(prescribedBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_functional_evaluations_patient_date ON functional_evaluations(patientId, evaluationDate DESC)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_rehabilitation_plans_patient_date ON rehabilitation_plans(patientId, startDate DESC)`).catch(() => {});
  await run(`CREATE INDEX IF NOT EXISTS idx_rehabilitation_sessions_plan_date ON rehabilitation_sessions(rehabilitationPlanId, sessionDate DESC)`).catch(() => {});

  // ========== DENTISTRY TABLES ==========
  await run(`
    CREATE TABLE IF NOT EXISTS dental_records (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL UNIQUE,
      generalNotes TEXT,
      allergies TEXT,
      lastExamDate DATE,
      nextExamDate DATE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS dental_teeth (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      toothNumber INT NOT NULL,
      status VARCHAR(50) DEFAULT 'healthy',
      notes TEXT,
      surfaces TEXT,
      lastTreatmentDate DATE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_patient_tooth (patientId, toothNumber),
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS dental_treatments (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      toothNumber INT,
      treatmentType VARCHAR(100) NOT NULL,
      description TEXT,
      surfaces TEXT,
      cost DECIMAL(10,2) DEFAULT 0,
      paid DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'completed',
      treatmentDate DATE NOT NULL,
      nextFollowUp DATE,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS dental_plans (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      teeth TEXT,
      treatments TEXT,
      estimatedCost DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      startDate DATE,
      endDate DATE,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS dental_xrays (
      id VARCHAR(36) PRIMARY KEY,
      patientId VARCHAR(36) NOT NULL,
      toothNumber INT,
      type VARCHAR(100),
      filePath TEXT,
      description TEXT,
      xrayDate DATE NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ========== TABLES SMS ==========
  await run(`
    CREATE TABLE IF NOT EXISTS sms_config (
      id VARCHAR(36) PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      mode VARCHAR(20) DEFAULT 'modem',
      port VARCHAR(100) DEFAULT '',
      baudRate INT DEFAULT 9600,
      countryCode VARCHAR(10) DEFAULT '+213',
      apiProvider VARCHAR(50) DEFAULT '',
      apiUrl TEXT DEFAULT (''),
      apiKey TEXT DEFAULT (''),
      apiSid VARCHAR(200) DEFAULT '',
      apiToken VARCHAR(200) DEFAULT '',
      apiFrom VARCHAR(50) DEFAULT '',
      reminderTemplate TEXT,
      appointmentTemplate TEXT,
      reminderHoursBefore INT DEFAULT 24,
      autoSendReminders BOOLEAN DEFAULT FALSE,
      autoSendOnCreate BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sms_log (
      id VARCHAR(36) PRIMARY KEY,
      phoneNumber VARCHAR(30) NOT NULL,
      message TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      sentAt DATETIME,
      provider VARCHAR(20) DEFAULT 'modem',
      errorMessage TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sms_reminders (
      id VARCHAR(36) PRIMARY KEY,
      appointmentId VARCHAR(36) NOT NULL,
      patientPhone VARCHAR(30),
      message TEXT,
      sent BOOLEAN DEFAULT FALSE,
      sentAt DATETIME,
      FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ========== TABLES CLOUD SYNC ==========
  await run(`
    CREATE TABLE IF NOT EXISTS cloud_sync_config (
      id VARCHAR(36) PRIMARY KEY,
      enabled BOOLEAN DEFAULT FALSE,
      provider VARCHAR(30) DEFAULT 'rest',
      apiUrl TEXT DEFAULT (''),
      apiKey TEXT DEFAULT (''),
      firebaseProject VARCHAR(200) DEFAULT '',
      firebaseKey TEXT DEFAULT (''),
      remoteHost VARCHAR(200) DEFAULT '',
      remotePort INT DEFAULT 3306,
      remoteUser VARCHAR(100) DEFAULT '',
      remotePassword VARCHAR(200) DEFAULT '',
      remoteDatabase VARCHAR(100) DEFAULT '',
      syncIntervalMinutes INT DEFAULT 1440,
      lastSyncAt DATETIME,
      autoSync BOOLEAN DEFAULT FALSE,
      backupEncryptionEnabled BOOLEAN DEFAULT FALSE,
      backupPassphrase TEXT DEFAULT (''),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id VARCHAR(36) PRIMARY KEY,
      syncType VARCHAR(20) DEFAULT 'push',
      status VARCHAR(20) DEFAULT 'pending',
      details TEXT,
      syncedAt DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cloud_sync_exports (
      id VARCHAR(36) PRIMARY KEY,
      exportId VARCHAR(36),
      exportedAt DATETIME,
      doctorName VARCHAR(255),
      cabinetName VARCHAR(255),
      deviceId VARCHAR(255),
      hostname VARCHAR(255),
      databaseMode VARCHAR(30),
      tableCountsJson LONGTEXT,
      jsonBackup LONGTEXT,
      csvBackup LONGTEXT,
      markdownBackup LONGTEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create master license if not exists
  await createMasterLicense();

  console.log('MariaDB tables created successfully');
}

async function ensureMariaDBSchemaUpgrades() {
  const safeAlter = async (sql) => {
    try {
      await run(sql);
    } catch (_) {
      // Ignorer si colonne dÃ©jÃ  existante
    }
  };

  // Users: retrait du rôle director et prise en charge du rôle dentiste
  await run("UPDATE users SET role = 'doctor' WHERE role = 'director'").catch(() => {});
  await safeAlter(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM('admin', 'doctor', 'dentist', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse', 'assistant') DEFAULT 'doctor'
  `);

  await safeAlter(`ALTER TABLE settings ADD COLUMN ownerUserId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE patients ADD COLUMN primaryDoctorId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE patients ADD COLUMN createdByUserId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE consultations ADD COLUMN doctorId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE licenses MODIFY COLUMN expirationDate DATETIME NULL`);
  await safeAlter(`CREATE INDEX idx_settings_owner_user ON settings(ownerUserId)`);
  await safeAlter(`CREATE INDEX idx_patients_primary_doctor ON patients(primaryDoctorId)`);
  await safeAlter(`CREATE INDEX idx_patients_created_by_user ON patients(createdByUserId)`);
  await safeAlter(`CREATE INDEX idx_consultations_doctor ON consultations(doctorId)`);
  await safeAlter(`ALTER TABLE waiting_room ADD COLUMN reason VARCHAR(255)`);
  await safeAlter(`ALTER TABLE waiting_room ADD COLUMN createdBy VARCHAR(36)`);
  await safeAlter(`ALTER TABLE waiting_room ADD COLUMN assignedTo VARCHAR(36)`);

  // package_config: compatibilitÃ© avec l'ancien schÃ©ma
  await safeAlter(`ALTER TABLE package_config ADD COLUMN clientName VARCHAR(255) NOT NULL DEFAULT 'Client Non ConfigurÃ©'`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN maxDoctors INT DEFAULT 1`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN maxAssistants INT DEFAULT 0`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featurePrescriptions BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureWaitingRoom BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureDailySummary BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureStatistics BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureInventory BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureKineStaff BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureRehabilitation BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureDentistry BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureCardiology BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureMedicalImaging BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN activeSpecialty VARCHAR(40) DEFAULT 'general'`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN enabledSpecialties TEXT`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureDebts BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureCalendar BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureDocuments BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureSickLeaves BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureMultiPC BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureAiReports BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureAiChatbot BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN featureAfterSalesSupport BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceDoctor DECIMAL(10,2) DEFAULT 60000`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceAssistant DECIMAL(10,2) DEFAULT 15000`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN pricePrescriptions DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceMultiPC DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceDentistry DECIMAL(10,2) DEFAULT 12000`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceCardiology DECIMAL(10,2) DEFAULT 12000`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceAiReports DECIMAL(10,2) DEFAULT 10000`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceAiChatbot DECIMAL(10,2) DEFAULT 8000`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN priceAfterSales DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN totalPrice DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE package_config ADD COLUMN currency VARCHAR(10) DEFAULT 'DZD'`);

  try {
    const [indexes] = await pool.query(`
      SHOW INDEX FROM medications
      WHERE Column_name = 'name' AND Non_unique = 0
    `);
    for (const index of indexes || []) {
      if (index?.Key_name && index.Key_name !== 'PRIMARY') {
        await run(`ALTER TABLE medications DROP INDEX \`${index.Key_name}\``);
        console.log(`â„¹ï¸ Index unique supprimÃ© sur medications.name: ${index.Key_name}`);
      }
    }
  } catch (error) {
    console.warn('Migration medications.name UNIQUE ignorÃ©e:', error?.message || error);
  }

  try {
    await run(`
      UPDATE package_config
      SET activeSpecialty = CASE
        WHEN featureRehabilitation = TRUE THEN 'mpr'
        WHEN featureCardiology = TRUE THEN 'cardiology'
        WHEN featureDentistry = TRUE THEN 'dentistry'
        ELSE 'general'
      END
      WHERE activeSpecialty IS NULL OR TRIM(activeSpecialty) = ''
    `);
    await run(`
      UPDATE package_config
      SET enabledSpecialties = CONCAT(
        '["general"',
        IF(featureRehabilitation = TRUE OR featureKineStaff = TRUE, ',"mpr"', ''),
        IF(featureCardiology = TRUE, ',"cardiology"', ''),
        IF(featureDentistry = TRUE, ',"dentistry"', ''),
        ']'
      )
      WHERE enabledSpecialties IS NULL
         OR TRIM(enabledSpecialties) = ''
         OR (enabledSpecialties = '["general"]' AND (featureRehabilitation = TRUE OR featureKineStaff = TRUE OR featureCardiology = TRUE OR featureDentistry = TRUE))
    `);
  } catch (error) {
    console.warn('package_config activeSpecialty migration skipped:', error?.message || error);
  }

  // settings: printer/scanner prÃ©fÃ©rÃ©s
  await safeAlter(`ALTER TABLE settings ADD COLUMN preferredPrinter VARCHAR(255)`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN preferredScanner VARCHAR(255)`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN preferredThermalPrinter VARCHAR(255)`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN publicBookingEnabled BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN publicBookingPort INT DEFAULT 4580`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN publicBookingToken VARCHAR(255)`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN publicBookingPublicUrl TEXT`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN publicBookingQrEnabled BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN cabinetLogoDataUrl LONGTEXT`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN cabinetWatermarkLogoDataUrl LONGTEXT`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN customTreatmentTypes LONGTEXT`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentColorMode VARCHAR(20) DEFAULT 'color'`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentPrimaryColor VARCHAR(20) DEFAULT '#1a8c7e'`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentTypeColors LONGTEXT`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentTextScale INT DEFAULT 100`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentLogoScale INT DEFAULT 90`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentStyleVariant VARCHAR(20) DEFAULT 'classic'`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentWatermarkOpacity INT DEFAULT 5`);
  await safeAlter(`ALTER TABLE settings ADD COLUMN documentHideSignature BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE appointments ADD COLUMN bookingSource VARCHAR(30) DEFAULT 'manual'`);
  await safeAlter(`ALTER TABLE appointments ADD COLUMN bookingCode VARCHAR(100)`);
  await safeAlter(`ALTER TABLE patient_attachments ADD COLUMN examFamily VARCHAR(80) DEFAULT 'Document'`);
  await safeAlter(`ALTER TABLE payments ADD COLUMN description TEXT`);
  await safeAlter(`ALTER TABLE consultations MODIFY COLUMN cim10Code TEXT`);
  await safeAlter(`ALTER TABLE sick_leaves MODIFY COLUMN cim10Code TEXT`);
  await safeAlter(`ALTER TABLE consultations ADD COLUMN acts LONGTEXT`);
  await safeAlter(`ALTER TABLE consultations ADD COLUMN kineId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE consultations ADD COLUMN isUnpaid BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE consultations ADD COLUMN unpaidAmount DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE consultations ADD COLUMN unpaidDueDate DATE`);
  await safeAlter(`ALTER TABLE functional_evaluations ADD COLUMN walkingDistance VARCHAR(255)`);
  await safeAlter(`ALTER TABLE functional_evaluations ADD COLUMN jointRange TEXT`);
  await safeAlter(`ALTER TABLE functional_evaluations ADD COLUMN mrcScores LONGTEXT`);
  await safeAlter(`ALTER TABLE rehabilitation_plans ADD COLUMN mediumTermObjectives TEXT`);
  await safeAlter(`ALTER TABLE rehabilitation_plans ADD COLUMN equipmentDetails TEXT`);
  await safeAlter(`ALTER TABLE medical_scales ADD COLUMN evaluationId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE medical_scales ADD COLUMN evaluationDate DATETIME DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(`ALTER TABLE analysis_types ADD COLUMN normalValues TEXT`);
  await safeAlter(`ALTER TABLE analysis_types ADD COLUMN unit VARCHAR(100)`);
  await safeAlter(`ALTER TABLE analysis_types ADD COLUMN price DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE analysis_types ADD COLUMN isActive BOOLEAN DEFAULT TRUE`);
  await safeAlter(`ALTER TABLE analysis_types ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);

  // sms: confirmation Ã  la crÃ©ation du RDV
  await safeAlter(`ALTER TABLE sms_config ADD COLUMN appointmentTemplate TEXT`);
  await safeAlter(`ALTER TABLE sms_config ADD COLUMN autoSendOnCreate BOOLEAN DEFAULT TRUE`);

  // dentistry: compatibilitÃ© colonnes riches
  await safeAlter(`ALTER TABLE dental_teeth ADD COLUMN toothName VARCHAR(255)`);
  await safeAlter(`ALTER TABLE dental_treatments ADD COLUMN material VARCHAR(255)`);
  await safeAlter(`ALTER TABLE dental_treatments ADD COLUMN color VARCHAR(100)`);
  await safeAlter(`ALTER TABLE dental_treatments ADD COLUMN isPaid BOOLEAN DEFAULT FALSE`);
  await safeAlter(`ALTER TABLE dental_treatments ADD COLUMN planId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE dental_treatments ADD COLUMN doctorId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE treatment_plans ADD COLUMN treatmentType VARCHAR(255)`);
  await safeAlter(`ALTER TABLE treatment_plans ADD COLUMN specialty VARCHAR(100) DEFAULT 'dentistry'`);
  await safeAlter(`ALTER TABLE treatment_plans ADD COLUMN totalCost DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE treatment_plans ADD COLUMN totalPaid DECIMAL(10,2) DEFAULT 0`);
  await safeAlter(`ALTER TABLE treatment_plans ADD COLUMN sessionsCount INT DEFAULT 1`);
  await safeAlter(`ALTER TABLE treatment_plans ADD COLUMN createdBy VARCHAR(36)`);
  await safeAlter(`ALTER TABLE plan_payment_sessions ADD COLUMN paymentId VARCHAR(36)`);
  await safeAlter(`ALTER TABLE dental_xrays ADD COLUMN xrayType VARCHAR(100)`);
}

/**
 * CrÃ©e le super admin par dÃ©faut
 */
async function createDefaultSuperAdmin() {
  try {
    const existing = await queryOne("SELECT id FROM users WHERE username = 'superadmin'");
    if (!existing) {
      const crypto = await import('crypto');
      const { v4: uuidv4 } = await import('uuid');
      const hashedPassword = crypto.createHash('sha256').update('MedPro@2024!').digest('hex');
      const id = uuidv4();
      await run(
        `INSERT INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, 'superadmin', hashedPassword, 'Super Administrateur', 'admin', true, true, true]
      );
      console.log('Super admin created (superadmin / MedPro@2024!)');
    }
  } catch (error) {
    console.error('Erreur crÃ©ation super admin:', error);
  }
}

/**
 * CrÃ©e la licence master par dÃ©faut
 */
async function createMasterLicense() {
  try {
    const { v4: uuidv4 } = await import('uuid');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const FIVE_DAY_LICENSE_KEY = 'MEDPRO-TRIAL-5JOURS';
    const TRIAL_LICENSE_KEY = 'MEDPRO-TRIAL-7JOURS';
    const FIFTEEN_DAY_LICENSE_KEY = 'MEDPRO-TRIAL-15JOURS';
    const ANNUAL_LICENSE_KEY = 'MEDPRO-ANNUELLE-1AN';
    const UNLIMITED_LICENSE_KEY = 'MEDPRO-ILLIMITEE-ACTIVE';

    const oldMaster = await queryOne("SELECT id FROM licenses WHERE `key` = 'MEDPRO-MASTER-2024-ACTIVATED'");
    const annualExisting = await queryOne("SELECT id FROM licenses WHERE `key` = ?", [ANNUAL_LICENSE_KEY]);
    if (oldMaster) {
      if (annualExisting) {
        await run("DELETE FROM licenses WHERE `key` = 'MEDPRO-MASTER-2024-ACTIVATED'");
      } else {
        await run(
          "UPDATE licenses SET `key` = ?, clientName = 'Licence 1 An', expirationDate = NULL WHERE `key` = 'MEDPRO-MASTER-2024-ACTIVATED'",
          [ANNUAL_LICENSE_KEY]
        );
      }
    }

    const defaults = [
      [FIVE_DAY_LICENSE_KEY, 'Licence Essai 5 Jours'],
      [TRIAL_LICENSE_KEY, 'Licence Essai 7 Jours'],
      [FIFTEEN_DAY_LICENSE_KEY, 'Licence Essai 15 Jours'],
      [ANNUAL_LICENSE_KEY, 'Licence 1 An'],
      [UNLIMITED_LICENSE_KEY, 'Licence IllimitÃ©e']
    ];

    for (const [key, clientName] of defaults) {
      const existing = await queryOne("SELECT id FROM licenses WHERE `key` = ?", [key]);
      if (!existing) {
        await run(
          `INSERT INTO licenses (id, \`key\`, clientName, generatedDate, expirationDate, activated, activationDate, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), key, clientName, now, null, false, null, 'pending']
        );
      }
    }
  } catch (error) {
    console.error('Erreur crÃ©ation licence par dÃ©faut:', error);
  }
}

export async function ensureSchemaForConfig(config) {
  const previousPool = pool;
  const previousConfig = dbConfig;
  const targetConfig = {
    host: config.host || 'localhost',
    port: Number(config.port) || 3306,
    user: config.user,
    password: config.password || '',
    database: config.database || 'physiocare'
  };

  const schemaPool = mysql.createPool({
    host: targetConfig.host,
    port: targetConfig.port,
    user: targetConfig.user,
    password: targetConfig.password,
    database: targetConfig.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: 10000,
    enableKeepAlive: true
  });

  try {
    const connection = await schemaPool.getConnection();
    connection.release();

    pool = schemaPool;
    dbConfig = targetConfig;
    await createTables();

    return {
      success: true,
      database: targetConfig.database
    };
  } finally {
    try {
      await schemaPool.end();
    } catch (_) {
      // Ignore close errors during migration preparation.
    }
    pool = previousPool;
    dbConfig = previousConfig;
  }
}

/**
 * RÃ©cupÃ¨re le pool de connexions
 */
export function getDatabase() {
  if (!pool) {
    throw new Error('Base de donnÃ©es MariaDB non initialisÃ©e');
  }
  return pool;
}

/**
 * Ferme toutes les connexions
 */
export async function closeDatabase() {
  if (pool) {
    try {
      await pool.end();
      console.log('MariaDB pool closed');
    } catch (error) {
      console.warn('MariaDB pool was already closed:', error.message);
    } finally {
      pool = null;
    }
  }
}

/**
 * ExÃ©cute une requÃªte SELECT et retourne tous les rÃ©sultats
 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * ExÃ©cute une requÃªte INSERT, UPDATE, DELETE
 */
export async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * ExÃ©cute une requÃªte et retourne le premier rÃ©sultat
 */
export async function queryOne(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows[0] || null;
}

/**
 * Test de connexion
 */
export async function testConnection(config) {
  try {
    const testPool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: 1
    });
    
    const connection = await testPool.getConnection();
    connection.release();
    await testPool.end();
    
    return { success: true, message: 'Connexion rÃ©ussie' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Obtient la configuration actuelle
 */
export function getConfig() {
  return dbConfig || loadConfig();
}
