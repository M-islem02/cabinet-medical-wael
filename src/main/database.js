/**
 * Module d'initialisation et gestion de la base de données SQLite
 * PhysioCare - Médecine Physique et Fonctionnelle
 */

import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;
const TRIAL_LICENSE_KEY = 'MEDPRO-TRIAL-7JOURS';
const ANNUAL_LICENSE_KEY = 'MEDPRO-ANNUELLE-1AN';
const UNLIMITED_LICENSE_KEY = 'MEDPRO-ILLIMITEE-ACTIVE';

// Simple prepared-statement cache for better-sqlite3. Reusing prepared statements
// avoids re-parsing SQL on every query, which noticeably speeds up repeated calls.
const STATEMENT_CACHE_MAX_SIZE = 200;
const statementCache = new Map();

function getCachedStatement(sql) {
  if (!db) {
    throw new Error('Base de données SQLite non initialisée');
  }
  if (statementCache.has(sql)) {
    return statementCache.get(sql);
  }
  const statement = db.prepare(sql);
  if (statementCache.size >= STATEMENT_CACHE_MAX_SIZE) {
    const firstKey = statementCache.keys().next().value;
    statementCache.delete(firstKey);
  }
  statementCache.set(sql, statement);
  return statement;
}

function clearStatementCache() {
  statementCache.clear();
}

/**
 * Initialise la base de données
 */
export function initializeDatabase() {
  try {
    const dbPath = path.join(app.getPath('userData'), 'physiocare.db');
    db = new Database(dbPath);
    
    // Activer les clés étrangères
    db.pragma('foreign_keys = ON');
    
    // Créer les tables si elles n'existent pas
    createTables();
    
    console.log(`✅ Base de données PhysioCare initialisée: ${dbPath}`);
    return db;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation de la DB:', error);
    throw error;
  }
}

/**
 * Crée toutes les tables nécessaires
 */
function createTables() {
  // Table des licences (expirationDate peut être NULL pour licence illimitée)
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      clientName TEXT NOT NULL,
      generatedDate TEXT NOT NULL,
      expirationDate TEXT,
      activated BOOLEAN DEFAULT 0,
      activationDate TEXT,
      machineId TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);

  try {
    db.exec(`ALTER TABLE licenses ADD COLUMN activationDate TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE licenses ADD COLUMN machineId TEXT`);
  } catch (e) { /* Column exists */ }

  // Table des utilisateurs - Rôles étendus pour MPR
  // Rôles: admin, doctor, kinesitherapeute, ergotherapeute, orthophoniste, nurse, assistant
  // isSuperAdmin = true pour le compte principal (développeur) qui ne peut pas être supprimé
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      fullName TEXT,
      email TEXT,
      phone TEXT,
      role TEXT DEFAULT 'doctor' CHECK(role IN ('admin', 'doctor', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse', 'assistant')),
      specialty TEXT,
      color TEXT DEFAULT '#3b82f6',
      isAdmin BOOLEAN DEFAULT 0,
      isSuperAdmin BOOLEAN DEFAULT 0,
      isActive BOOLEAN DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      lastLogin TEXT,
      resetCode TEXT,
      resetCodeExpiry TEXT
    )
  `);

  // Migration: ajouter isSuperAdmin si elle n'existe pas
  try {
    db.exec(`ALTER TABLE users ADD COLUMN isSuperAdmin BOOLEAN DEFAULT 0`);
  } catch (e) { /* Column exists */ }

  // Créer les licences par défaut si elles n'existent pas
  createDefaultLicenses();

  // Add new columns if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN fullName TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN isAdmin BOOLEAN DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN isActive BOOLEAN DEFAULT 1`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN lastLogin TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN resetCode TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN resetCodeExpiry TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN isSuperAdmin BOOLEAN DEFAULT 0`);
  } catch (e) { /* Column exists */ }

  // Fix users table CHECK constraint (director supprimé)
  try {
    const checkTableDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (checkTableDef && checkTableDef.sql && checkTableDef.sql.includes('director')) {
      console.log('Migrating users table to remove director role...');
      db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          fullName TEXT,
          email TEXT,
          phone TEXT,
          role TEXT DEFAULT 'doctor' CHECK(role IN ('admin', 'doctor', 'kinesitherapeute', 'ergotherapeute', 'orthophoniste', 'nurse', 'assistant')),
          specialty TEXT,
          color TEXT DEFAULT '#3b82f6',
          isAdmin BOOLEAN DEFAULT 0,
          isSuperAdmin BOOLEAN DEFAULT 0,
          isActive BOOLEAN DEFAULT 1,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          lastLogin TEXT,
          resetCode TEXT,
          resetCodeExpiry TEXT
        );
         INSERT INTO users_new (id, username, password, fullName, email, phone, role, specialty, color, isAdmin, isSuperAdmin, isActive, createdAt, lastLogin, resetCode, resetCodeExpiry)
         SELECT id, username, password, fullName, email, phone,
           CASE WHEN role = 'director' THEN 'doctor' ELSE role END,
           specialty, color, isAdmin, isSuperAdmin, isActive, createdAt, lastLogin, resetCode, resetCodeExpiry
         FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        COMMIT;
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (error) {
    console.error('Error migrating users table constraint:', error);
    try { db.exec("ROLLBACK;"); } catch(e) {}
  }


  // Table des paramètres du cabinet
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      cabinetName TEXT,
      cabinetAddress TEXT,
      cabinetPhone TEXT,
      cabinetEmail TEXT,
      doctorName TEXT,
      doctorRPPS TEXT,
      doctorSpecialty TEXT,
      documentColorMode TEXT DEFAULT 'color',
      documentPrimaryColor TEXT DEFAULT '#1a8c7e',
      documentTypeColors TEXT,
      documentTextScale INTEGER DEFAULT 100,
      documentLogoScale INTEGER DEFAULT 90,
      documentStyleVariant TEXT DEFAULT 'classic',
      documentWatermarkOpacity INTEGER DEFAULT 5,
      documentHideSignature INTEGER DEFAULT 0,
      preferredPrinter TEXT,
      preferredScanner TEXT,
      preferredThermalPrinter TEXT,
      publicBookingEnabled INTEGER DEFAULT 0,
      publicBookingPort INTEGER DEFAULT 4580,
      publicBookingToken TEXT,
      publicBookingPublicUrl TEXT,
      publicBookingQrEnabled INTEGER DEFAULT 1,
      ownerUserId TEXT,
      cabinetLogoDataUrl TEXT,
      cabinetWatermarkLogoDataUrl TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    db.exec(`ALTER TABLE settings ADD COLUMN preferredPrinter TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN preferredScanner TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN preferredThermalPrinter TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN publicBookingEnabled INTEGER DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN publicBookingPort INTEGER DEFAULT 4580`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN publicBookingToken TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN publicBookingPublicUrl TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN publicBookingQrEnabled INTEGER DEFAULT 1`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN cabinetLogoDataUrl TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN cabinetWatermarkLogoDataUrl TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentColorMode TEXT DEFAULT 'color'`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentPrimaryColor TEXT DEFAULT '#1a8c7e'`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentTypeColors TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentTextScale INTEGER DEFAULT 100`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentLogoScale INTEGER DEFAULT 90`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentStyleVariant TEXT DEFAULT 'classic'`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentWatermarkOpacity INTEGER DEFAULT 5`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN documentHideSignature INTEGER DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN ownerUserId TEXT`);
  } catch (e) { /* Column exists */ }

  // Table des patients
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      primaryDoctorId TEXT,
      createdByUserId TEXT,
      dateOfBirth TEXT,
      gender TEXT,
      socialSecurityNumber TEXT UNIQUE,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      zipCode TEXT,
      bloodType TEXT,
      allergies TEXT,
      medicalHistory TEXT,
      emergencyContact TEXT,
      emergencyPhone TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(primaryDoctorId) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(createdByUserId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des consultations
  db.exec(`
    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      doctorId TEXT,
      consultationDate TEXT NOT NULL,
      consultationType TEXT,
      reason TEXT,
      anamnesis TEXT,
      clinicalExamination TEXT,
      bloodPressure TEXT,
      temperature REAL,
      weight REAL,
      height REAL,
      imc REAL,
      diagnosis TEXT,
      cim10Code TEXT,
      treatment TEXT,
      advice TEXT,
      notes TEXT,
      attachments TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(doctorId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_consultations_patient_date
    ON consultations(patientId, consultationDate DESC)
  `);

  // Add attachments column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN attachments TEXT`);
  } catch (error) {
    // Column already exists, ignore error
  }
  try {
    db.exec(`ALTER TABLE patients ADD COLUMN primaryDoctorId TEXT`);
  } catch (error) {
    // Column already exists, ignore error
  }
  try {
    db.exec(`ALTER TABLE patients ADD COLUMN createdByUserId TEXT`);
  } catch (error) {
    // Column already exists, ignore error
  }
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN doctorId TEXT`);
  } catch (error) {
    // Column already exists, ignore error
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor ON patients(primaryDoctorId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_patients_created_by_user ON patients(createdByUserId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctorId)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_attachments (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      mimeType TEXT,
      fileSize INTEGER DEFAULT 0,
      examFamily TEXT DEFAULT 'Document',
      sourceType TEXT DEFAULT 'import',
      sourceLabel TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  try {
    db.exec(`ALTER TABLE patient_attachments ADD COLUMN examFamily TEXT DEFAULT 'Document'`);
  } catch (error) {
    // Column already exists, ignore error
  }

  // Table des ordonnances
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      prescriptionDate TEXT NOT NULL,
      medications TEXT,
      notes TEXT,
      generatedPDF TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_date
    ON prescriptions(patientId, prescriptionDate DESC)
  `);

  // Table des arrêts de travail
  db.exec(`
    CREATE TABLE IF NOT EXISTS sick_leaves (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      numberOfDays INTEGER,
      diagnosis TEXT,
      cim10Code TEXT,
      allowedOutings BOOLEAN DEFAULT 0,
      generatedPDF TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sick_leaves_patient_start
    ON sick_leaves(patientId, startDate DESC)
  `);

  // Table des rendez-vous
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      appointmentDateTime TEXT NOT NULL,
      appointmentType TEXT,
      reason TEXT,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      bookingSource TEXT DEFAULT 'manual',
      bookingCode TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);
  try {
    db.exec(`ALTER TABLE appointments ADD COLUMN bookingSource TEXT DEFAULT 'manual'`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE appointments ADD COLUMN bookingCode TEXT`);
  } catch (e) { /* Column exists */ }

  // Table des factures
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      invoiceDate TEXT NOT NULL,
      consultationId TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  // Table des documents médicaux (factures personnalisées, rapports, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      documentType TEXT NOT NULL,
      title TEXT,
      payload TEXT,
      lastPrintedAt TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  db.exec('DROP INDEX IF EXISTS idx_documents_consultation_type');
  db.exec('DROP INDEX IF EXISTS idx_documents_patient_type');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_patient_type
    ON documents(patientId, documentType)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_consultation
    ON documents(consultationId)
  `);

  // Table des paiements
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      amount REAL NOT NULL,
      paymentDate TEXT NOT NULL,
      paymentMethod TEXT DEFAULT 'Espèces',
      description TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payments_date
    ON payments(paymentDate DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payments_consultation
    ON payments(consultationId)
  `);

  // Migration: add description column if missing
  try {
    db.exec(`ALTER TABLE payments ADD COLUMN description TEXT`);
  } catch (e) { /* Column exists */ }

  // Table des documents patients (fichiers attachés)
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_documents (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      fileName TEXT NOT NULL,
      fileType TEXT,
      filePath TEXT,
      fileSize INTEGER,
      description TEXT,
      category TEXT DEFAULT 'Autre',
      uploadDate TEXT DEFAULT CURRENT_TIMESTAMP,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  // Table du journal d'activité (audit)
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      userId TEXT,
      action TEXT NOT NULL,
      tableName TEXT,
      recordId TEXT,
      details TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // ========== NOUVELLES TABLES ==========

  // Table des modèles d'ordonnances
  db.exec(`
    CREATE TABLE IF NOT EXISTS prescription_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      medications TEXT NOT NULL,
      notes TEXT,
      category TEXT DEFAULT 'Général',
      usageCount INTEGER DEFAULT 0,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des médicaments (base de données)
  db.exec(`
    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      genericName TEXT,
      category TEXT,
      dosageForm TEXT,
      defaultDosage TEXT,
      defaultIntake TEXT,
      defaultDuration TEXT,
      defaultBoxes TEXT,
      instructions TEXT,
      contraindications TEXT,
      sideEffects TEXT,
      isActive INTEGER DEFAULT 1,
      usageCount INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Helpful indexes for fast medication autocomplete searches.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_medications_name_nocase
    ON medications(name COLLATE NOCASE)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_medications_genericName_nocase
    ON medications(genericName COLLATE NOCASE)
  `);

  // Table des catégories de médicaments
  db.exec(`
    CREATE TABLE IF NOT EXISTS medication_categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des analyses médicales
  db.exec(`
    CREATE TABLE IF NOT EXISTS medical_analyses (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      analysisDate TEXT NOT NULL,
      analysisType TEXT NOT NULL,
      laboratory TEXT,
      results TEXT,
      normalValues TEXT,
      interpretation TEXT,
      status TEXT DEFAULT 'pending',
      attachmentPath TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  // Table des types d'analyses (catalogue)
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Général',
      description TEXT,
      normalValues TEXT,
      unit TEXT,
      price REAL DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des dépenses du cabinet
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      expenseDate TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      paymentMethod TEXT DEFAULT 'Espèces',
      vendor TEXT,
      receiptNumber TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des catégories de dépenses
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table de l'inventaire / stock
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'Général',
      description TEXT,
      quantity INTEGER DEFAULT 0,
      minQuantity INTEGER DEFAULT 5,
      unit TEXT DEFAULT 'unité',
      purchasePrice REAL DEFAULT 0,
      sellingPrice REAL DEFAULT 0,
      supplier TEXT,
      expirationDate TEXT,
      location TEXT,
      notes TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table des mouvements de stock
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      inventoryId TEXT NOT NULL,
      movementType TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      previousQuantity INTEGER,
      newQuantity INTEGER,
      reason TEXT,
      reference TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des dettes / impayés
  db.exec(`
    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      invoiceId TEXT,
      amount REAL NOT NULL,
      paidAmount REAL DEFAULT 0,
      remainingAmount REAL NOT NULL,
      dueDate TEXT,
      status TEXT DEFAULT 'unpaid',
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  // Table des notifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      relatedType TEXT,
      relatedId TEXT,
      isRead INTEGER DEFAULT 0,
      scheduledFor TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Table des plans de traitement
  db.exec(`
    CREATE TABLE IF NOT EXISTS treatment_plans (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      title TEXT NOT NULL,
      description TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT,
      sessions INTEGER DEFAULT 1,
      completedSessions INTEGER DEFAULT 0,
      frequency TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  // Table des séances de traitement
  db.exec(`
    CREATE TABLE IF NOT EXISTS treatment_sessions (
      id TEXT PRIMARY KEY,
      treatmentPlanId TEXT NOT NULL,
      sessionNumber INTEGER NOT NULL,
      scheduledDate TEXT NOT NULL,
      completedDate TEXT,
      status TEXT DEFAULT 'scheduled',
      therapistId TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(treatmentPlanId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(therapistId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // ========== TABLES SPÉCIFIQUES MPR (MÉDECINE PHYSIQUE ET FONCTIONNELLE) ==========

  // Table des évaluations fonctionnelles
  db.exec(`
    CREATE TABLE IF NOT EXISTS functional_evaluations (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      evaluationDate TEXT NOT NULL,
      evaluatorId TEXT,
      
      -- Autonomie (AVQ / ADL)
      autonomyScore INTEGER,
      autonomyNotes TEXT,
      
      -- Mobilité
      mobilityScore INTEGER,
      mobilityNotes TEXT,
      walkingAbility TEXT,
      walkingAid TEXT,
      walkingDistance TEXT,
      
      -- Équilibre
      balanceScore INTEGER,
      balanceNotes TEXT,
      
      -- Coordination
      coordinationScore INTEGER,
      coordinationNotes TEXT,
      
      -- Douleur (EVA 0-10)
      painScore INTEGER,
      painLocation TEXT,
      painType TEXT,
      painNotes TEXT,
      
      -- Spasticité (Ashworth 0-4)
      spasticityScore INTEGER,
      spasticityLocation TEXT,
      spasticityNotes TEXT,
      jointRange TEXT,
      mrcScores TEXT,
      
      -- Score global
      globalAssessment TEXT,
      functionalDiagnosis TEXT,
      limitations TEXT,
      activityRestrictions TEXT,
      socialParticipation TEXT,
      
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des examens cliniques fonctionnels
  db.exec(`
    CREATE TABLE IF NOT EXISTS clinical_exams (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      examDate TEXT NOT NULL,
      examinerId TEXT,
      
      -- Amplitudes articulaires (JSON: {joint: {flexion, extension, rotation...}})
      jointRanges TEXT,
      
      -- Force musculaire (MRC 0-5)
      muscleStrength TEXT,
      
      -- Tonus musculaire
      muscleTone TEXT,
      
      -- Posture
      posture TEXT,
      postureNotes TEXT,
      
      -- Sensibilité
      sensitivity TEXT,
      sensitivityNotes TEXT,
      
      -- Réflexes
      reflexes TEXT,
      reflexNotes TEXT,
      
      -- Marche / Démarche
      gait TEXT,
      gaitNotes TEXT,
      
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(examinerId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des échelles et scores médicaux
  db.exec(`
    CREATE TABLE IF NOT EXISTS medical_scales (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      evaluationDate TEXT NOT NULL,
      evaluatorId TEXT,
      
      scaleType TEXT NOT NULL,
      score REAL,
      maxScore REAL,
      interpretation TEXT,
      details TEXT,
      notes TEXT,
      
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des plans de rééducation
  db.exec(`
    CREATE TABLE IF NOT EXISTS rehabilitation_plans (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      createdBy TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT,
      status TEXT DEFAULT 'active',
      
      -- Objectifs
      shortTermObjectives TEXT,
      mediumTermObjectives TEXT,
      longTermObjectives TEXT,
      
      -- Prescriptions de rééducation
      kinesiotherapy INTEGER DEFAULT 0,
      kinesiotherapyFrequency TEXT,
      kinesiotherapyNotes TEXT,
      
      ergotherapy INTEGER DEFAULT 0,
      ergotherapyFrequency TEXT,
      ergotherapyNotes TEXT,
      
      speechTherapy INTEGER DEFAULT 0,
      speechTherapyFrequency TEXT,
      speechTherapyNotes TEXT,
      
      -- Appareillage
      orthosis INTEGER DEFAULT 0,
      orthosisType TEXT,
      orthosisNotes TEXT,
      
      wheelchair INTEGER DEFAULT 0,
      wheelchairType TEXT,
      wheelchairNotes TEXT,
      
      prosthesis INTEGER DEFAULT 0,
      prosthesisType TEXT,
      prosthesisNotes TEXT,
      
      otherEquipment TEXT,
      equipmentDetails TEXT,
      
      -- Autres
      hydrotherapy INTEGER DEFAULT 0,
      electrotherapy INTEGER DEFAULT 0,
      massotherapy INTEGER DEFAULT 0,
      
      totalSessions INTEGER DEFAULT 0,
      completedSessions INTEGER DEFAULT 0,
      
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des séances de rééducation
  db.exec(`
    CREATE TABLE IF NOT EXISTS rehabilitation_sessions (
      id TEXT PRIMARY KEY,
      rehabilitationPlanId TEXT NOT NULL,
      patientId TEXT NOT NULL,
      therapistId TEXT,
      sessionDate TEXT NOT NULL,
      sessionType TEXT,
      sessionNumber INTEGER DEFAULT 1,
      duration INTEGER DEFAULT 30,
      
      -- Contenu de la séance
      techniques TEXT,
      exercises TEXT,
      observations TEXT,
      
      -- Évolution
      progressNotes TEXT,
      painLevel INTEGER,
      patientFeedback TEXT,
      
      status TEXT DEFAULT 'scheduled',
      billedAmount REAL DEFAULT 0,
      
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(rehabilitationPlanId) REFERENCES rehabilitation_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(therapistId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table de suivi de l'évolution
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_progress (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      evaluationDate TEXT NOT NULL,
      evaluatorId TEXT,
      
      category TEXT,
      previousScore REAL,
      currentScore REAL,
      improvement TEXT,
      status TEXT,
      
      patientAdherence TEXT,
      notes TEXT,
      
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(evaluatorId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des équipements prescrits au patient
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_equipment (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      consultationId TEXT,
      prescribedBy TEXT,
      
      equipmentType TEXT NOT NULL,
      equipmentName TEXT NOT NULL,
      description TEXT,
      prescriptionDate TEXT NOT NULL,
      deliveryDate TEXT,
      supplier TEXT,
      
      status TEXT DEFAULT 'prescribed',
      notes TEXT,
      
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL,
      FOREIGN KEY(prescribedBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  console.log('✅ Tables créées avec succès');
  
  // Add new schema for waiting room, kiné staff, consultation acts
  createWaitingRoomTables();
  
  // Add package configuration table
  createPackageConfigTable();
  
  // Add dentistry tables
  createDentistryTables();
  
  // Add SMS and Cloud Sync tables
  createSMSTables();
  createCloudSyncTables();
  
  ensureSchemaUpgrades();
  ensureDefaultData();
  ensureDefaultCategories();
  ensureMPRDefaultData();
}

/**
 * Create package/feature configuration table
 * This controls which features are enabled for each client installation
 */
function createPackageConfigTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS package_config (
      id TEXT PRIMARY KEY,
      clientName TEXT NOT NULL,
      packageType TEXT DEFAULT 'basic',
      maxDoctors INTEGER DEFAULT 1,
      maxAssistants INTEGER DEFAULT 0,
      featurePrescriptions INTEGER DEFAULT 1,
      featureWaitingRoom INTEGER DEFAULT 1,
      featureDailySummary INTEGER DEFAULT 1,
      featureStatistics INTEGER DEFAULT 1,
      featureInventory INTEGER DEFAULT 0,
      featureKineStaff INTEGER DEFAULT 0,
      featureRehabilitation INTEGER DEFAULT 0,
      featureDentistry INTEGER DEFAULT 0,
      featureCardiology INTEGER DEFAULT 0,
      featureMedicalImaging INTEGER DEFAULT 1,
      activeSpecialty TEXT DEFAULT 'general',
      featureDebts INTEGER DEFAULT 1,
      featureCalendar INTEGER DEFAULT 1,
      featureDocuments INTEGER DEFAULT 1,
      featureSickLeaves INTEGER DEFAULT 1,
      featureMultiPC INTEGER DEFAULT 0,
      featureAiReports INTEGER DEFAULT 0,
      featureAiChatbot INTEGER DEFAULT 0,
      featureAfterSalesSupport INTEGER DEFAULT 1,
      priceDoctor REAL DEFAULT 56000,
      priceAssistant REAL DEFAULT 12000,
      pricePrescriptions REAL DEFAULT 4500,
      priceMultiPC REAL DEFAULT 18000,
      priceDentistry REAL DEFAULT 12000,
      priceCardiology REAL DEFAULT 12000,
      priceAiReports REAL DEFAULT 25000,
      priceAiChatbot REAL DEFAULT 20000,
      priceAfterSales REAL DEFAULT 0,
      totalPrice REAL DEFAULT 0,
      currency TEXT DEFAULT 'DZD',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add new columns if they don't exist (for upgrades)
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN featureMultiPC INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN featureAiReports INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN featureAiChatbot INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN featureDentistry INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN featureMedicalImaging INTEGER DEFAULT 1`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN priceDentistry REAL DEFAULT 12000`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN featureCardiology INTEGER DEFAULT 0`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN activeSpecialty TEXT DEFAULT 'general'`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE package_config ADD COLUMN priceCardiology REAL DEFAULT 12000`);
  } catch (e) { /* column exists */ }

  try {
    db.exec(`
      UPDATE package_config
      SET activeSpecialty = CASE
        WHEN featureRehabilitation = 1 THEN 'mpr'
        WHEN featureCardiology = 1 THEN 'cardiology'
        WHEN featureDentistry = 1 THEN 'dentistry'
        ELSE 'general'
      END
      WHERE activeSpecialty IS NULL OR TRIM(activeSpecialty) = ''
    `);
  } catch (e) { /* ignore migration update issues */ }
  
  // Create default package config if none exists
  const existing = db.prepare('SELECT id FROM package_config LIMIT 1').get();
  if (!existing) {
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO package_config (id, clientName, createdAt)
      VALUES (?, 'Client Non Configuré', ?)
    `).run(id, now);
    console.log('✅ Package config table created with default entry');
  }
}

// ========== TABLES DENTISTERIE ==========

/**
 * Create dentistry tables for the dental module
 */
function createDentistryTables() {
  // Table des dossiers dentaires patient (un par patient)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dental_records (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL UNIQUE,
      bloodType TEXT,
      allergies TEXT,
      medicalNotes TEXT,
      lastVisitDate TEXT,
      nextVisitDate TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);

  // Table des états dentaires (chaque dent, état actuel)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dental_teeth (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      toothNumber INTEGER NOT NULL,
      toothName TEXT,
      status TEXT DEFAULT 'healthy',
      surfaces TEXT,
      notes TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      UNIQUE(patientId, toothNumber)
    )
  `);

  // Table des actes/traitements dentaires
  db.exec(`
    CREATE TABLE IF NOT EXISTS dental_treatments (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      toothNumber INTEGER,
      treatmentDate TEXT NOT NULL,
      treatmentType TEXT NOT NULL,
      surfaces TEXT,
      description TEXT,
      material TEXT,
      color TEXT,
      cost REAL DEFAULT 0,
      isPaid INTEGER DEFAULT 0,
      dentistId TEXT,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(dentistId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des plans de traitement dentaires
  db.exec(`
    CREATE TABLE IF NOT EXISTS dental_plans (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT,
      estimatedCost REAL DEFAULT 0,
      actualCost REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'normal',
      treatments TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Table des radiographies dentaires
  db.exec(`
    CREATE TABLE IF NOT EXISTS dental_xrays (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      xrayDate TEXT NOT NULL,
      xrayType TEXT NOT NULL,
      toothNumber INTEGER,
      filePath TEXT,
      findings TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  console.log('✅ Dentistry tables created');
}

// ========== TABLES SMS ==========
function createSMSTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'modem',
      port TEXT DEFAULT '',
      baudRate INTEGER DEFAULT 9600,
      countryCode TEXT DEFAULT '+213',
      apiProvider TEXT DEFAULT '',
      apiUrl TEXT DEFAULT '',
      apiKey TEXT DEFAULT '',
      apiSid TEXT DEFAULT '',
      apiToken TEXT DEFAULT '',
      apiFrom TEXT DEFAULT '',
      reminderTemplate TEXT DEFAULT 'Rappel: Votre RDV au cabinet {cabinet} est prévu le {date} à {heure}. Merci de confirmer.',
      appointmentTemplate TEXT DEFAULT 'Bonjour {patient}, votre RDV au cabinet {cabinet} est enregistré pour le {date} à {heure} ({type}). Contact: {phone}.',
      reminderHoursBefore INTEGER DEFAULT 24,
      autoSendReminders INTEGER DEFAULT 0,
      autoSendOnCreate INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_log (
      id TEXT PRIMARY KEY,
      phoneNumber TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending',
      sentAt TEXT,
      provider TEXT DEFAULT 'modem',
      errorMessage TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_reminders (
      id TEXT PRIMARY KEY,
      appointmentId TEXT NOT NULL,
      patientPhone TEXT,
      message TEXT,
      sent INTEGER DEFAULT 0,
      sentAt TEXT,
      FOREIGN KEY(appointmentId) REFERENCES appointments(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ SMS tables created');
}

// ========== TABLES CLOUD SYNC ==========
function createCloudSyncTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_sync_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      provider TEXT DEFAULT 'rest',
      apiUrl TEXT DEFAULT '',
      apiKey TEXT DEFAULT '',
      firebaseProject TEXT DEFAULT '',
      firebaseKey TEXT DEFAULT '',
      remoteHost TEXT DEFAULT '',
      remotePort INTEGER DEFAULT 3306,
      remoteUser TEXT DEFAULT '',
      remotePassword TEXT DEFAULT '',
      remoteDatabase TEXT DEFAULT '',
      syncIntervalMinutes INTEGER DEFAULT 1440,
      lastSyncAt TEXT,
      autoSync INTEGER DEFAULT 0,
      backupEncryptionEnabled INTEGER DEFAULT 0,
      backupPassphrase TEXT DEFAULT '',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      syncType TEXT DEFAULT 'push',
      status TEXT DEFAULT 'pending',
      details TEXT,
      syncedAt TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_sync_exports (
      id TEXT PRIMARY KEY,
      exportId TEXT,
      exportedAt TEXT,
      doctorName TEXT,
      cabinetName TEXT,
      deviceId TEXT,
      hostname TEXT,
      databaseMode TEXT,
      tableCountsJson TEXT,
      jsonBackup TEXT,
      csvBackup TEXT,
      markdownBackup TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Cloud Sync tables created');
}

/**
 * Create waiting room, kiné staff, and consultation acts tables
 */
function createWaitingRoomTables() {
  // Table for kiné staff (not user accounts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kine_staff (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      specialty TEXT DEFAULT 'Général',
      sessionPrice REAL DEFAULT 1500,
      isActive INTEGER DEFAULT 1,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Fix any NULL isActive values (migration for existing records)
  db.exec(`UPDATE kine_staff SET isActive = 1 WHERE isActive IS NULL`);

  // Table for kiné sessions (linked to kine_staff)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kine_sessions (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      kineId TEXT NOT NULL,
      consultationId TEXT,
      sessionDate TEXT NOT NULL,
      sessionNumber INTEGER DEFAULT 1,
      duration INTEGER DEFAULT 30,
      price REAL DEFAULT 0,
      paymentStatus TEXT DEFAULT 'unpaid',
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(kineId) REFERENCES kine_staff(id) ON DELETE CASCADE,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE SET NULL
    )
  `);

  // Table for waiting room
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiting_room (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      arrivalTime TEXT NOT NULL,
      reason TEXT,
      priority INTEGER DEFAULT 0,
      assignedTo TEXT,
      status TEXT DEFAULT 'waiting',
      calledAt TEXT,
      completedAt TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY(assignedTo) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  try {
    db.exec(`ALTER TABLE waiting_room ADD COLUMN assignedTo TEXT`);
  } catch (e) { /* Column exists */ }

  // Table for consultation acts
  db.exec(`
    CREATE TABLE IF NOT EXISTS consultation_acts (
      id TEXT PRIMARY KEY,
      consultationId TEXT NOT NULL,
      actType TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL DEFAULT 0,
      kineId TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(consultationId) REFERENCES consultations(id) ON DELETE CASCADE,
      FOREIGN KEY(kineId) REFERENCES kine_staff(id) ON DELETE SET NULL
    )
  `);

  // Table for notifications between users
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      fromUserId TEXT,
      toUserId TEXT,
      toRole TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      patientId TEXT,
      relatedType TEXT,
      relatedId TEXT,
      data TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(fromUserId) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(toUserId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Add acts and unpaid columns to consultations if they don't exist
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN acts TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN kineId TEXT`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN isUnpaid INTEGER DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN unpaidAmount REAL DEFAULT 0`);
  } catch (e) { /* Column exists */ }
  try {
    db.exec(`ALTER TABLE consultations ADD COLUMN unpaidDueDate TEXT`);
  } catch (e) { /* Column exists */ }

  console.log('✅ Waiting room & Kiné tables created');
}

/**
 * Crée les données par défaut (admin uniquement)
 */
function ensureDefaultData() {
  // Créer le compte admin par défaut s'il n'existe pas
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const passwordHash = crypto.createHash('sha256').update('admin2024').digest('hex');
    
    db.prepare(`
      INSERT INTO users (id, username, password, fullName, role, isAdmin, isActive, createdAt)
      VALUES (?, 'admin', ?, 'Administrateur Système', 'admin', 1, 1, datetime('now'))
    `).run(uuidv4(), passwordHash);
    
    console.log('✅ Compte admin par défaut créé (admin / admin2024)');
  }
}

function ensureSchemaUpgrades() {
  ensureMedicationsTableAllowsDuplicateNames();

  ensureColumnExists(
    'prescriptions',
    'prescriptionDate',
    'TEXT DEFAULT CURRENT_TIMESTAMP',
    () => {
      db.exec(`
        UPDATE prescriptions
        SET prescriptionDate = COALESCE(prescriptionDate, date, createdAt, CURRENT_TIMESTAMP)
        WHERE prescriptionDate IS NULL
           OR prescriptionDate = ''
      `);
    }
  );

  ensureColumnExists(
    'prescriptions',
    'notes',
    'TEXT',
    () => {
      db.exec(`
        UPDATE prescriptions
        SET notes = COALESCE(notes, instructions, '')
        WHERE notes IS NULL
      `);
    }
  );

  ensureColumnExists(
    'prescriptions',
    'updatedAt',
    'TEXT DEFAULT CURRENT_TIMESTAMP',
    () => {
      db.exec(`
        UPDATE prescriptions
        SET updatedAt = COALESCE(updatedAt, createdAt, CURRENT_TIMESTAMP)
        WHERE updatedAt IS NULL
           OR updatedAt = ''
      `);
    }
  );

  ensureColumnExists(
    'sms_config',
    'appointmentTemplate',
    "TEXT DEFAULT 'Bonjour {patient}, votre RDV au cabinet {cabinet} est enregistré pour le {date} à {heure} ({type}). Contact: {phone}.'"
  );

  ensureColumnExists(
    'sms_config',
    'autoSendOnCreate',
    'INTEGER DEFAULT 1'
  );

  ensureColumnExists(
    'functional_evaluations',
    'walkingDistance',
    'TEXT'
  );

  ensureColumnExists(
    'functional_evaluations',
    'jointRange',
    'TEXT'
  );

  ensureColumnExists(
    'functional_evaluations',
    'mrcScores',
    'TEXT'
  );

  ensureColumnExists(
    'rehabilitation_plans',
    'mediumTermObjectives',
    'TEXT'
  );

  ensureColumnExists(
    'rehabilitation_plans',
    'equipmentDetails',
    'TEXT'
  );
}

function ensureMedicationsTableAllowsDuplicateNames() {
  try {
    const tableEntry = db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'medications'
    `).get();
    const tableSql = String(tableEntry?.sql || '');
    if (!/name\s+text\s+not\s+null\s+unique/i.test(tableSql)) {
      return;
    }

    const legacyTableName = 'medications_legacy_unique_names';
    const medicationColumns = [
      'id',
      'name',
      'genericName',
      'category',
      'dosageForm',
      'defaultDosage',
      'defaultIntake',
      'defaultDuration',
      'defaultBoxes',
      'instructions',
      'contraindications',
      'sideEffects',
      'isActive',
      'usageCount',
      'createdAt',
      'updatedAt'
    ];

    db.exec('BEGIN TRANSACTION');
    db.exec(`DROP TABLE IF EXISTS ${legacyTableName}`);
    db.exec(`ALTER TABLE medications RENAME TO ${legacyTableName}`);
    db.exec(`
      CREATE TABLE medications (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        genericName TEXT,
        category TEXT,
        dosageForm TEXT,
        defaultDosage TEXT,
        defaultIntake TEXT,
        defaultDuration TEXT,
        defaultBoxes TEXT,
        instructions TEXT,
        contraindications TEXT,
        sideEffects TEXT,
        isActive INTEGER DEFAULT 1,
        usageCount INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      INSERT INTO medications (${medicationColumns.join(', ')})
      SELECT ${medicationColumns.join(', ')}
      FROM ${legacyTableName}
    `);
    db.exec(`DROP TABLE ${legacyTableName}`);
    db.exec('COMMIT');
    console.log('✅ Migration medications: doublons de nom désormais autorisés');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    console.error('❌ Erreur migration medications (suppression UNIQUE name):', error);
  }
}

function ensureColumnExists(tableName, columnName, columnDefinition, onAdd = null) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some(col => col.name === columnName);
    if (!exists) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
      if (typeof onAdd === 'function') {
        onAdd();
      }
      console.log(`ℹ️ Colonne ajoutée: ${tableName}.${columnName}`);
    }
  } catch (error) {
    console.error(`❌ Erreur lors de la vérification de schéma pour ${tableName}.${columnName}:`, error);
  }
}

/**
 * Crée les catégories par défaut
 */
function ensureDefaultCategories() {
  // Catégories de dépenses par défaut
  const defaultExpenseCategories = [
    { name: 'Fournitures médicales', description: 'Gants, seringues, pansements, etc.' },
    { name: 'Équipement médical', description: 'Appareils, instruments médicaux' },
    { name: 'Médicaments', description: 'Stock de médicaments du cabinet' },
    { name: 'Loyer', description: 'Loyer du local' },
    { name: 'Électricité', description: 'Factures d\'électricité' },
    { name: 'Eau', description: 'Factures d\'eau' },
    { name: 'Internet/Téléphone', description: 'Communications' },
    { name: 'Entretien', description: 'Nettoyage et maintenance' },
    { name: 'Assurance', description: 'Assurances professionnelles' },
    { name: 'Salaires', description: 'Salaires du personnel' },
    { name: 'Formation', description: 'Formations et conférences' },
    { name: 'Informatique', description: 'Logiciels, matériel informatique' },
    { name: 'Autres', description: 'Autres dépenses' }
  ];

  for (const cat of defaultExpenseCategories) {
    try {
      const exists = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(cat.name);
      if (!exists) {
        db.prepare('INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?)')
          .run(uuidv4(), cat.name, cat.description);
      }
    } catch (e) { /* ignore duplicates */ }
  }

  // Types d'analyses par défaut
  const defaultAnalysisTypes = [
    { name: 'Numération Formule Sanguine (NFS)', category: 'Hématologie', normalValues: 'Variables selon paramètres' },
    { name: 'Glycémie à jeun', category: 'Biochimie', normalValues: '0.70 - 1.10 g/L', unit: 'g/L' },
    { name: 'Hémoglobine glyquée (HbA1c)', category: 'Biochimie', normalValues: '< 6.5%', unit: '%' },
    { name: 'Créatinine', category: 'Biochimie', normalValues: '7-13 mg/L', unit: 'mg/L' },
    { name: 'Urée', category: 'Biochimie', normalValues: '0.15-0.45 g/L', unit: 'g/L' },
    { name: 'Cholestérol total', category: 'Lipides', normalValues: '< 2 g/L', unit: 'g/L' },
    { name: 'HDL Cholestérol', category: 'Lipides', normalValues: '> 0.40 g/L', unit: 'g/L' },
    { name: 'LDL Cholestérol', category: 'Lipides', normalValues: '< 1.60 g/L', unit: 'g/L' },
    { name: 'Triglycérides', category: 'Lipides', normalValues: '< 1.50 g/L', unit: 'g/L' },
    { name: 'ASAT (TGO)', category: 'Hépatique', normalValues: '< 40 UI/L', unit: 'UI/L' },
    { name: 'ALAT (TGP)', category: 'Hépatique', normalValues: '< 40 UI/L', unit: 'UI/L' },
    { name: 'TSH', category: 'Thyroïde', normalValues: '0.4-4.0 mUI/L', unit: 'mUI/L' },
    { name: 'T3 libre', category: 'Thyroïde', normalValues: '2.3-4.2 pg/mL', unit: 'pg/mL' },
    { name: 'T4 libre', category: 'Thyroïde', normalValues: '0.8-1.8 ng/dL', unit: 'ng/dL' },
    { name: 'Vitamine D', category: 'Vitamines', normalValues: '30-100 ng/mL', unit: 'ng/mL' },
    { name: 'Vitamine B12', category: 'Vitamines', normalValues: '200-900 pg/mL', unit: 'pg/mL' },
    { name: 'Fer sérique', category: 'Minéraux', normalValues: '60-170 µg/dL', unit: 'µg/dL' },
    { name: 'Ferritine', category: 'Minéraux', normalValues: '20-300 ng/mL', unit: 'ng/mL' },
    { name: 'CRP (Protéine C-Réactive)', category: 'Inflammation', normalValues: '< 6 mg/L', unit: 'mg/L' },
    { name: 'VS (Vitesse de Sédimentation)', category: 'Inflammation', normalValues: '< 20 mm/h', unit: 'mm/h' },
    { name: 'ECBU', category: 'Urinaire', normalValues: 'Stérile' },
    { name: 'Radiographie thoracique', category: 'Imagerie', normalValues: 'Normal' },
    { name: 'Échographie abdominale', category: 'Imagerie', normalValues: 'Normal' },
    { name: 'IRM', category: 'Imagerie', normalValues: 'Variable' },
    { name: 'Scanner', category: 'Imagerie', normalValues: 'Variable' },
    { name: 'ECG', category: 'Cardiologie', normalValues: 'Rythme sinusal normal' }
  ];

  for (const analysis of defaultAnalysisTypes) {
    try {
      const exists = db.prepare('SELECT id FROM analysis_types WHERE name = ?').get(analysis.name);
      if (!exists) {
        db.prepare('INSERT INTO analysis_types (id, name, category, normalValues, unit) VALUES (?, ?, ?, ?, ?)')
          .run(uuidv4(), analysis.name, analysis.category, analysis.normalValues, analysis.unit || null);
      }
    } catch (e) { /* ignore duplicates */ }
  }

  console.log('✅ Catégories par défaut créées');
}

/**
 * Récupère l'instance de la base de données
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Base de données non initialisée');
  }
  return db;
}

/**
 * Seeds a complete, realistic demo database for development/testing.
 * Safe to run multiple times: reference data is skipped when it already exists,
 * and transactional tables are filled up to their target counts.
 */
export function seedTestData() {
  console.log('🌱 Seeding complete demo database...');

  const report = {
    success: true,
    created: {},
    totals: {},
    errors: []
  };

  const TARGETS = {
    patients: 100,
    users: { doctors: 3, assistants: 2, kines: 2 },
    referenceMedications: 20,
    referenceAnalysisTypes: 15,
    referenceExpenseCategories: 10,
    kineStaff: 3,
    consultations: 50,
    prescriptions: 50,
    appointments: 50,
    payments: 50,
    sickLeaves: 50,
    medicalAnalyses: 50,
    inventory: 50,
    expenses: 50,
    debts: 50,
    documents: 25,
    patientDocuments: 25,
    waitingRoom: 50,
    kineSessions: 50,
    rehabilitationPlans: 25,
    rehabilitationSessions: 25,
    notifications: 50
  };

  // ---------- Helpers ----------
  const hashPassword = (pwd) => crypto.createHash('sha256').update(pwd).digest('hex');

  const getCount = (table) => {
    try {
      return db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count || 0;
    } catch (e) {
      return 0;
    }
  };

  const safeRun = (stmt, params, label) => {
    try {
      return stmt.run(...params);
    } catch (err) {
      console.log(`⚠️ ${label} error: ${err.message}`);
      report.errors.push(`${label}: ${err.message}`);
      return null;
    }
  };

  const randomDate = (minDays, maxDays) => {
    const now = new Date();
    const days = minDays + Math.floor(Math.random() * (maxDays - minDays + 1));
    now.setDate(now.getDate() + days);
    now.setHours(8 + Math.floor(Math.random() * 10), Math.random() > 0.5 ? 0 : 30, 0, 0);
    return now.toISOString();
  };

  const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const pickPatient = (patients) => patients[Math.floor(Math.random() * patients.length)];

  // ---------- Reference data: Users ----------
  const userPassword = hashPassword('demo2024');
  const demoUsers = [
    { username: 'dr.amedjoudj', fullName: 'Dr. Amine AMEDJOUDJ', role: 'doctor', specialty: 'Médecine physique et réadaptation', color: '#1a8c7e' },
    { username: 'dr.benali', fullName: 'Dr. Fatima BENALI', role: 'doctor', specialty: 'Rhumatologie', color: '#3b82f6' },
    { username: 'dr.cherifi', fullName: 'Dr. Karim CHERIFI', role: 'doctor', specialty: 'Orthopédie', color: '#8b5cf6' },
    { username: 'assistant.samira', fullName: 'Samira BOUAZZA', role: 'assistant', specialty: 'Secrétariat médical', color: '#f59e0b' },
    { username: 'assistant.nadia', fullName: 'Nadia HAMIDI', role: 'assistant', specialty: 'Accueil et prise de rendez-vous', color: '#10b981' },
    { username: 'kine.rachid', fullName: 'Rachid BELKACEM', role: 'kinesitherapeute', specialty: 'Rééducation orthopédique', color: '#ef4444' },
    { username: 'kine.karima', fullName: 'Karima OULD ALI', role: 'kinesitherapeute', specialty: 'Rééducation neurologique', color: '#ec4899' }
  ];

  const userIds = [];
  let createdUsers = 0;
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password, fullName, email, phone, role, specialty, color, isAdmin, isSuperAdmin, isActive, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, datetime('now'))
  `);

  for (const u of demoUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username);
    if (existing) {
      userIds.push(existing.id);
      continue;
    }
    const id = uuidv4();
    const email = `${u.username}@cabinet-demo.dz`;
    const phone = `0${5 + Math.floor(Math.random() * 3)}${String(10000000 + Math.floor(Math.random() * 90000000)).slice(-8)}`;
    const result = safeRun(insertUser, [id, u.username, userPassword, u.fullName, email, phone, u.role, u.specialty, u.color], 'user');
    if (result) createdUsers++;
    userIds.push(id);
  }
  report.created.users = createdUsers;

  const doctorIds = userIds.filter((_, i) => demoUsers[i].role === 'doctor');
  const kineUserIds = userIds.filter((_, i) => demoUsers[i].role === 'kinesitherapeute');
  const assistantIds = userIds.filter((_, i) => demoUsers[i].role === 'assistant');

  // ---------- Reference data: Medications ----------
  const medicationsCatalog = [
    { name: 'Paracétamol 500mg', genericName: 'Paracétamol', category: 'Antalgique', dosageForm: 'Comprimé', defaultDosage: '1 à 2 comprimés', defaultIntake: '3 fois par jour', defaultDuration: '5 jours', defaultBoxes: '1', instructions: 'À prendre en cas de douleur, espacer les prises d\'au moins 4 heures.', sideEffects: 'Hépatotoxicité en cas de surdosage' },
    { name: 'Paracétamol 1g', genericName: 'Paracétamol', category: 'Antalgique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '3 fois par jour', defaultDuration: '5 jours', defaultBoxes: '1', instructions: 'En cas de douleur modérée.', sideEffects: 'Risque hépatique si surdosage' },
    { name: 'Ibuprofène 400mg', genericName: 'Ibuprofène', category: 'Anti-inflammatoire', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '2 fois par jour après les repas', defaultDuration: '5 jours', defaultBoxes: '1', instructions: 'Ne pas prendre à jeun.', contraindications: 'Ulcère gastrique, insuffisance rénale', sideEffects: 'Troubles digestifs' },
    { name: 'Amoxicilline 1g', genericName: 'Amoxicilline', category: 'Antibiotique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '3 fois par jour', defaultDuration: '7 jours', defaultBoxes: '2', instructions: 'Respecter la durée complète du traitement.', contraindications: 'Allerie pénicilline', sideEffects: 'Éruption cutanée, diarrhée' },
    { name: 'Oméprazole 20mg', genericName: 'Oméprazole', category: 'Gastro-entérologie', dosageForm: 'Gélule', defaultDosage: '1 gélule', defaultIntake: '1 fois par jour le matin à jeun', defaultDuration: '14 jours', defaultBoxes: '1', instructions: 'À prendre avant le petit-déjeuner.', sideEffects: 'Maux de tête, diarrhée' },
    { name: 'Metformine 500mg', genericName: 'Metformine', category: 'Antidiabétique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '2 fois par jour au cours des repas', defaultDuration: '30 jours', defaultBoxes: '2', instructions: 'Augmenter progressivement la dose.', contraindications: 'Insuffisance rénale sévère', sideEffects: 'Troubles digestifs' },
    { name: 'Amlodipine 5mg', genericName: 'Amlodipine', category: 'Cardiologie', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '1 fois par jour le matin', defaultDuration: '30 jours', defaultBoxes: '1', instructions: 'Surveillance de la tension artérielle.', sideEffects: 'Œdèmes des chevilles' },
    { name: 'Atorvastatine 20mg', genericName: 'Atorvastatine', category: 'Cardiologie', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '1 fois par jour le soir', defaultDuration: '30 jours', defaultBoxes: '1', instructions: 'Bilan hépatique recommandé.', sideEffects: 'Douleurs musculaires' },
    { name: 'Levothyrox 50µg', genericName: 'Lévothyroxine', category: 'Endocrinologie', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '1 fois par jour le matin à jeun', defaultDuration: '30 jours', defaultBoxes: '1', instructions: 'Attendre 30 min avant le petit-déjeuner.', sideEffects: 'Tachycardie si surdosage' },
    { name: 'Doliprane 1000mg', genericName: 'Paracétamol', category: 'Antalgique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '3 fois par jour', defaultDuration: '3 jours', defaultBoxes: '1', instructions: 'En cas de fièvre ou douleur.', sideEffects: 'Hépatotoxicité en surdosage' },
    { name: 'Spasfon', genericName: 'Phloroglucinol/Triméthylphloroglucinol', category: 'Antispasmodique', dosageForm: 'Comprimé', defaultDosage: '2 comprimés', defaultIntake: '3 fois par jour', defaultDuration: '5 jours', defaultBoxes: '1', instructions: 'En cas de douleurs spasmodiques.', sideEffects: 'Météorisme' },
    { name: 'Mopral 20mg', genericName: 'Oméprazole', category: 'Gastro-entérologie', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '1 fois par jour', defaultDuration: '14 jours', defaultBoxes: '1', instructions: 'Le matin à jeun.', sideEffects: 'Céphalées' },
    { name: 'Efferalgan 500mg', genericName: 'Paracétamol', category: 'Antalgique', dosageForm: 'Comprimé effervescent', defaultDosage: '1 comprimé', defaultIntake: '3 fois par jour', defaultDuration: '5 jours', defaultBoxes: '1', instructions: 'À dissoudre dans un verre d\'eau.', sideEffects: 'Risque hépatique' },
    { name: 'Vitamine D3 200000 UI', genericName: 'Cholécalciférol', category: 'Vitamine', dosageForm: 'Ampoule buvable', defaultDosage: '1 ampoule', defaultIntake: '1 fois par mois', defaultDuration: '3 mois', defaultBoxes: '3', instructions: 'À prendre avec un repas.', sideEffects: 'Hypercalcémie si surdosage' },
    { name: 'Magnésium B6', genericName: 'Magnésium + Vitamine B6', category: 'Vitamine', dosageForm: 'Comprimé', defaultDosage: '2 comprimés', defaultIntake: '2 fois par jour', defaultDuration: '30 jours', defaultBoxes: '2', instructions: 'Au cours des repas.', sideEffects: 'Diarrhée' },
    { name: 'Cetirizine 10mg', genericName: 'Cétirizine', category: 'Antiallergique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '1 fois par jour le soir', defaultDuration: '10 jours', defaultBoxes: '1', instructions: 'Éviter l\'alcool.', sideEffects: 'Somnolence' },
    { name: 'Lexomil 6mg', genericName: 'Bromazépam', category: 'Anxiolytique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '2 fois par jour', defaultDuration: '7 jours', defaultBoxes: '1', instructions: 'Arrêt progressif.', contraindications: 'Insuffisance respiratoire', sideEffects: 'Somnolence' },
    { name: 'Augmentin 1g', genericName: 'Amoxicilline/Acide clavulanique', category: 'Antibiotique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '3 fois par jour', defaultDuration: '7 jours', defaultBoxes: '2', instructions: 'Au cours des repas.', contraindications: 'Allergie pénicilline', sideEffects: 'Troubles digestifs' },
    { name: 'Gaviscon', genericName: 'Alginate de sodium/bicarbonate de sodium', category: 'Gastro-entérologie', dosageForm: 'Suspension buvable', defaultDosage: '10 mL', defaultIntake: '4 fois par jour après les repas', defaultDuration: '7 jours', defaultBoxes: '1', instructions: 'Secouer avant emploi.', sideEffects: 'Constipation' },
    { name: 'Sérésta 10mg', genericName: 'Oxazépam', category: 'Anxiolytique', dosageForm: 'Comprimé', defaultDosage: '1 comprimé', defaultIntake: '2 fois par jour', defaultDuration: '5 jours', defaultBoxes: '1', instructions: 'Utilisation courte.', contraindications: 'Insuffisance hépatique sévère', sideEffects: 'Sédation' }
  ];

  const insertMedication = db.prepare(`
    INSERT INTO medications (id, name, genericName, category, dosageForm, defaultDosage, defaultIntake, defaultDuration, defaultBoxes, instructions, contraindications, sideEffects, isActive, usageCount, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
  `);

  let createdMeds = 0;
  for (const med of medicationsCatalog) {
    const existing = db.prepare('SELECT id FROM medications WHERE name = ?').get(med.name);
    if (existing) continue;
    safeRun(insertMedication, [uuidv4(), med.name, med.genericName, med.category, med.dosageForm, med.defaultDosage, med.defaultIntake, med.defaultDuration, med.defaultBoxes, med.instructions, med.contraindications || null, med.sideEffects], 'medication');
    createdMeds++;
  }
  report.created.medications = createdMeds;

  // ---------- Reference data: Analysis types ----------
  const analysisTypesCatalog = [
    { name: 'NFS (Numération Formule Sanguine)', category: 'Hématologie', description: 'Bilan sanguin complet', normalValues: 'Hb: 12-16 g/dL, GB: 4000-10000/mm³', unit: 'variables', price: 1500 },
    { name: 'Glycémie à jeun', category: 'Biochimie', description: 'Mesure de la glycémie', normalValues: '0.70 - 1.10 g/L', unit: 'g/L', price: 800 },
    { name: 'HbA1c', category: 'Biochimie', description: 'Contrôle glycémique sur 3 mois', normalValues: '< 6.5%', unit: '%', price: 1200 },
    { name: 'Créatinine', category: 'Biochimie', description: 'Fonction rénale', normalValues: '7-13 mg/L', unit: 'mg/L', price: 700 },
    { name: 'Bilan lipidique', category: 'Lipides', description: 'Cholestérol, HDL, LDL, TG', normalValues: 'CT < 2 g/L', unit: 'g/L', price: 1800 },
    { name: 'TSH', category: 'Thyroïde', description: 'Fonction thyroïdienne', normalValues: '0.4-4.0 mUI/L', unit: 'mUI/L', price: 900 },
    { name: 'Vitamine D', category: 'Vitamines', description: 'Bilan vitamino-calcique', normalValues: '30-100 ng/mL', unit: 'ng/mL', price: 1500 },
    { name: 'CRP', category: 'Inflammation', description: 'Marqueur inflammatoire', normalValues: '< 6 mg/L', unit: 'mg/L', price: 700 },
    { name: 'VS', category: 'Inflammation', description: 'Vitesse de sédimentation', normalValues: '< 20 mm/h', unit: 'mm/h', price: 500 },
    { name: 'ECBU', category: 'Urinaire', description: 'Examen cytobactériologique des urines', normalValues: 'Stérile', unit: '', price: 1200 },
    { name: 'Radiographie thoracique', category: 'Imagerie', description: 'Rx pulmonaire', normalValues: 'Normal', unit: '', price: 2500 },
    { name: 'Radiographie du rachis', category: 'Imagerie', description: 'Rx lombaire/cervicale', normalValues: 'Normal', unit: '', price: 2500 },
    { name: 'Échographie abdominale', category: 'Imagerie', description: 'Échographie générale', normalValues: 'Normal', unit: '', price: 3000 },
    { name: 'IRM cérébrale', category: 'Imagerie', description: 'Imagerie par résonance magnétique', normalValues: 'Normal', unit: '', price: 12000 },
    { name: 'Scanner thoraco-abdominal', category: 'Imagerie', description: 'TDM', normalValues: 'Normal', unit: '', price: 9000 }
  ];

  const insertAnalysisType = db.prepare(`
    INSERT INTO analysis_types (id, name, category, description, normalValues, unit, price, isActive, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  let createdAnalysisTypes = 0;
  for (const at of analysisTypesCatalog) {
    const existing = db.prepare('SELECT id FROM analysis_types WHERE name = ?').get(at.name);
    if (existing) continue;
    safeRun(insertAnalysisType, [uuidv4(), at.name, at.category, at.description, at.normalValues, at.unit, at.price || 0], 'analysis_type');
    createdAnalysisTypes++;
  }
  report.created.analysisTypes = createdAnalysisTypes;

  // ---------- Reference data: Expense categories ----------
  const expenseCategoriesCatalog = [
    { name: 'Fournitures médicales', description: 'Gants, seringues, pansements' },
    { name: 'Équipement médical', description: 'Appareils et instruments' },
    { name: 'Médicaments', description: 'Stock de médicaments' },
    { name: 'Loyer', description: 'Loyer du cabinet' },
    { name: 'Électricité', description: 'Factures d\'électricité' },
    { name: 'Eau', description: 'Factures d\'eau' },
    { name: 'Internet/Téléphone', description: 'Communications' },
    { name: 'Entretien', description: 'Nettoyage et maintenance' },
    { name: 'Assurance', description: 'Assurances professionnelles' },
    { name: 'Salaires', description: 'Salaires du personnel' }
  ];

  const insertExpenseCategory = db.prepare(`
    INSERT INTO expense_categories (id, name, description, isActive, createdAt)
    VALUES (?, ?, ?, 1, datetime('now'))
  `);

  let createdExpenseCategories = 0;
  for (const ec of expenseCategoriesCatalog) {
    const existing = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(ec.name);
    if (existing) continue;
    safeRun(insertExpenseCategory, [uuidv4(), ec.name, ec.description], 'expense_category');
    createdExpenseCategories++;
  }
  report.created.expenseCategories = createdExpenseCategories;

  // ---------- Kiné staff ----------
  const kineStaffCatalog = [
    { firstName: 'Rachid', lastName: 'BELKACEM', phone: '0555111222', email: 'r.belkacem@kine.dz', specialty: 'Rééducation orthopédique', sessionPrice: 2000 },
    { firstName: 'Karima', lastName: 'OULD ALI', phone: '0666222333', email: 'k.ouldali@kine.dz', specialty: 'Kinésithérapie respiratoire', sessionPrice: 2500 },
    { firstName: 'Sofiane', lastName: 'HADDAD', phone: '0777333444', email: 's.haddad@kine.dz', specialty: 'Rééducation neurologique', sessionPrice: 3000 }
  ];

  const insertKineStaff = db.prepare(`
    INSERT INTO kine_staff (id, firstName, lastName, phone, email, specialty, sessionPrice, isActive, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `);

  const kineStaffIds = [];
  let createdKineStaff = 0;
  for (const k of kineStaffCatalog) {
    const existing = db.prepare('SELECT id FROM kine_staff WHERE phone = ?').get(k.phone);
    if (existing) {
      kineStaffIds.push(existing.id);
      continue;
    }
    const id = uuidv4();
    const result = safeRun(insertKineStaff, [id, k.firstName, k.lastName, k.phone, k.email, k.specialty, k.sessionPrice, 'Kinésithérapeute de démonstration'], 'kine_staff');
    if (result) createdKineStaff++;
    kineStaffIds.push(id);
  }
  report.created.kineStaff = createdKineStaff;

  // ---------- Patients: ensure exactly 100 ----------
  const maleFirstNames = ['Mohammed', 'Ahmed', 'Karim', 'Youcef', 'Amine', 'Riad', 'Sofiane', 'Yacine', 'Nabil', 'Hakim', 'Mehdi', 'Anis', 'Fares', 'Lotfi', 'Samir', 'Tarek', 'Walid', 'Djamel', 'Mourad', 'Lyes', 'Aymen', 'Islem', 'Adel', 'Khaled', 'Billel'];
  const femaleFirstNames = ['Fatima', 'Amina', 'Nadia', 'Samira', 'Karima', 'Lina', 'Sabrina', 'Sara', 'Imane', 'Meriem', 'Nour', 'Yousra', 'Houda', 'Amel', 'Djamila', 'Fatiha', 'Khadija', 'Asma', 'Rania', 'Sonia', 'Mounia', 'Lamia', 'Dounia', 'Ines', 'Wassila'];
  const lastNames = ['BENALI', 'KHEDDAR', 'BOUALEM', 'CHERIFI', 'MEZIANE', 'HAMIDI', 'SLIMANI', 'BOUAZZA', 'BELAID', 'MANSOURI', 'AIT ALI', 'KHELIFI', 'TOUATI', 'BOUZID', 'HAMZAOUI', 'ABIDI', 'KHERRADJI', 'MEBARKI', 'HADDAD', 'BENSALEM', 'BELKACEM', 'OULD ALI', 'HADDAD', 'AMARA', 'BENMOUSSA', 'SAADAOUI', 'GUEDDOUDJ', 'DAOUD', 'SEGHIR', 'KACI'];
  const wilayas = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Sétif', 'Blida', 'Béjaïa', 'Tizi Ouzou', 'Batna', 'Tlemcen', 'Biskra', 'Djelfa', 'Jijel', 'Mostaganem', 'Tiaret'];
  const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const insertPatient = db.prepare(`
    INSERT INTO patients (id, firstName, lastName, primaryDoctorId, createdByUserId, dateOfBirth, gender, socialSecurityNumber, email, phone, address, city, zipCode, bloodType, allergies, medicalHistory, emergencyContact, emergencyPhone, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const patientIds = [];
  let createdPatients = 0;

  const existingPatients = db.prepare('SELECT id FROM patients').all();
  for (const p of existingPatients) patientIds.push(p.id);

  const targetPatients = TARGETS.patients;
  for (let i = 0; patientIds.length < targetPatients && i < targetPatients * 2; i++) {
    const isMale = i % 2 === 0;
    const firstName = isMale ? maleFirstNames[i % maleFirstNames.length] : femaleFirstNames[i % femaleFirstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const year = 1960 + (i % 45);
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    const phone = `0${5 + (i % 3)}${String(10000000 + i).slice(-8)}`;
    const socialSecurityNumber = `${year}${String(i).padStart(4, '0')}${String(1000000 + i).slice(-6)}`;

    const existingByPhone = db.prepare('SELECT id FROM patients WHERE phone = ?').get(phone);
    const existingBySSN = db.prepare('SELECT id FROM patients WHERE socialSecurityNumber = ?').get(socialSecurityNumber);
    if (existingByPhone || existingBySSN) continue;

    const id = uuidv4();
    const city = wilayas[i % wilayas.length];
    const address = `${10 + (i % 90)} Rue ${['des Oliviers', 'Mohamed V', 'de la Liberté', 'Ben Badis', 'El Firdous', 'Zighoud Youcef', 'des Frères', 'de l\'Indépendance'][i % 8]}, ${city}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}${i}@demo.dz`;
    const doctorId = randomItem(doctorIds);

    safeRun(insertPatient, [
      id, firstName, lastName, doctorId, randomItem([...assistantIds, ...doctorIds]),
      `${year}-${month}-${day}`, isMale ? 'M' : 'F', socialSecurityNumber, email, phone,
      address, city, String(10000 + (i % 9000)), randomItem(bloodTypes),
      i % 7 === 0 ? 'Pollen, Poussière' : null,
      i % 5 === 0 ? 'Hypertension artérielle contrôlée' : (i % 6 === 0 ? 'Diabète type 2' : null),
      `${randomItem(['Mohammed', 'Ahmed', 'Fatima', 'Amina'])} ${lastName}`,
      `0${5 + (i % 3)}${String(20000000 + i).slice(-8)}`
    ], 'patient');

    patientIds.push(id);
    createdPatients++;
  }
  report.created.patients = createdPatients;
  report.totals.patients = patientIds.length;

  // Helper tables for generated data
  const diagnoses = [
    'Lombalgie chronique L4-L5',
    'Cervicalgie post-traumatique',
    'Gonarthrose bilatérale',
    'Tendinite de la coiffe des rotateurs',
    'Capsulite rétractile de l\'épaule droite',
    'Syndrome du canal carpien',
    'Entorse de cheville grade II',
    'Sciatique S1 gauche',
    'Épicondylite latérale',
    'Tendinite d\'Achille',
    'Arthrose de hanche',
    'Syndrome fémoro-patellaire',
    'Fracture du col du fémur opérée',
    'Spondylarthrose cervicale',
    'Lombosciatique par hernie discale L5-S1',
    'Paraplégie flasque post-traumatique',
    'Hémiplégie gauche post-AVC',
    'Polyarthrite rhumatoïde',
    'Fibromyalgie',
    'Ostéoporose vertébrale'
  ];

  const consultationReasons = [
    'Douleur dorsale irradiant vers le membre inférieur',
    'Raideur articulaire matinale',
    'Difficulté à la marche',
    'Douleur à l\'épaule lors des mouvements',
    'Engourdissements des doigts',
    'Limitation des amplitudes articulaires',
    'Lombalgie aiguë',
    'Rééducation post-opératoire',
    'Bilan de kinésithérapie',
    'Contrôle après traitement'
  ];

  const consultationTypes = ['Première consultation', 'Suivi', 'Contrôle', 'Urgence'];
  const paymentMethods = ['Espèces', 'Carte', 'Virement', 'Chèque'];
  const appointmentTypes = ['Consultation', 'Contrôle', 'Rééducation', 'Kinésithérapie'];
  const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'cancelled', 'pending'];
  const documentCategories = ['Compte-rendu', 'Ordonnance', 'Certificat', 'Radio', 'Analyse', 'Autre'];
  const documentTypes = ['certificat', 'ordonnance', 'compte_rendu', 'lettre', 'autre'];
  const inventoryCategories = ['Médicament', 'Fourniture médicale', 'Matériel de rééducation', 'Petit matériel', 'Produit d\'entretien'];
  const inventoryUnits = ['boîte', 'unité', 'paquet', 'rouleau', 'flacon', 'ampoule'];
  const expenseVendors = ['Pharmacie centrale', 'MediAlger', 'FourniMed', 'Sarl BioEquip', 'Pharmacie du centre', 'Global Med DZ'];

  // ---------- Consultations ----------
  const insertConsultation = db.prepare(`
    INSERT INTO consultations (id, patientId, doctorId, consultationDate, consultationType, reason, anamnesis, clinicalExamination, bloodPressure, temperature, weight, height, imc, diagnosis, cim10Code, treatment, advice, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdConsultations = 0;
  const currentConsultations = getCount('consultations');
  while (createdConsultations + currentConsultations < TARGETS.consultations) {
    const patient = pickPatient(patientIds);
    const diagnosis = randomItem(diagnoses);
    const cim10 = ['M54.5', 'M17.1', 'M75.1', 'G56.0', 'S93.4', 'M51.1', 'M19.9', 'I69.3', 'M06.9', 'M79.7'][createdConsultations % 10];
    const weight = 55 + (createdConsultations % 50);
    const height = 1.55 + ((createdConsultations % 25) / 100);
    const imc = Math.round((weight / (height * height)) * 10) / 10;

    const result = safeRun(insertConsultation, [
      uuidv4(), patient, randomItem(doctorIds), randomDate(-90, 0),
      randomItem(consultationTypes), randomItem(consultationReasons),
      'Antécédents rapportés par le patient.', 'Examen clinique sans particularité notable.',
      `${12 + (createdConsultations % 20)}/${8 + (createdConsultations % 10)}`,
      36.5 + (createdConsultations % 5) * 0.1, weight, height, imc,
      diagnosis, cim10, 'Rééducation fonctionnelle et suivi médical.',
      'Surveillance clinique, hydratation, activité physique adaptée.', 'Patient coopérant'
    ], 'consultation');
    if (result) createdConsultations++;
  }
  report.created.consultations = createdConsultations;
  report.totals.consultations = getCount('consultations');

  // Fetch some consultation IDs for relationships
  const consultationIds = db.prepare('SELECT id, patientId FROM consultations ORDER BY RANDOM() LIMIT 60').all();

  // ---------- Prescriptions ----------
  const insertPrescription = db.prepare(`
    INSERT INTO prescriptions (id, patientId, consultationId, prescriptionDate, medications, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const medsForPrescriptions = medicationsCatalog.map(m => ({ name: m.name, dosage: m.defaultDosage, duration: m.defaultDuration }));
  let createdPrescriptions = 0;
  const currentPrescriptions = getCount('prescriptions');
  while (createdPrescriptions + currentPrescriptions < TARGETS.prescriptions) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdPrescriptions % consultationIds.length];
    const numMeds = 2 + Math.floor(Math.random() * 3);
    const selectedMeds = [];
    for (let m = 0; m < numMeds; m++) selectedMeds.push(randomItem(medsForPrescriptions));

    const result = safeRun(insertPrescription, [
      uuidv4(), patient, consult?.id || null, randomDate(-60, 0),
      JSON.stringify(selectedMeds), 'À prendre selon les indications médicales.'
    ], 'prescription');
    if (result) createdPrescriptions++;
  }
  report.created.prescriptions = createdPrescriptions;
  report.totals.prescriptions = getCount('prescriptions');

  // ---------- Appointments ----------
  const insertAppointment = db.prepare(`
    INSERT INTO appointments (id, patientId, appointmentDateTime, appointmentType, reason, status, notes, bookingSource, bookingCode, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdAppointments = 0;
  const currentAppointments = getCount('appointments');
  while (createdAppointments + currentAppointments < TARGETS.appointments) {
    const patient = pickPatient(patientIds);
    const isFuture = Math.random() > 0.4;
    const date = isFuture ? randomDate(1, 30) : randomDate(-30, 0);
    const status = isFuture ? randomItem(['scheduled', 'confirmed', 'pending']) : randomItem(['completed', 'cancelled']);

    const result = safeRun(insertAppointment, [
      uuidv4(), patient, date, randomItem(appointmentTypes),
      'Suivi médical programmé', status, 'Rendez-vous de démonstration',
      'manual', `RDV-${Date.now()}-${createdAppointments}`
    ], 'appointment');
    if (result) createdAppointments++;
  }
  report.created.appointments = createdAppointments;
  report.totals.appointments = getCount('appointments');

  // ---------- Payments ----------
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdPayments = 0;
  const currentPayments = getCount('payments');
  while (createdPayments + currentPayments < TARGETS.payments) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdPayments % consultationIds.length];
    const amount = [1500, 2000, 2500, 3000, 3500, 4000][createdPayments % 6];

    const result = safeRun(insertPayment, [
      uuidv4(), patient, consult?.id || null, amount, randomDate(-90, 0),
      randomItem(paymentMethods), 'Règlement consultation', 'Paiement enregistré en démonstration'
    ], 'payment');
    if (result) createdPayments++;
  }
  report.created.payments = createdPayments;
  report.totals.payments = getCount('payments');

  // ---------- Sick leaves ----------
  const insertSickLeave = db.prepare(`
    INSERT INTO sick_leaves (id, patientId, consultationId, startDate, endDate, numberOfDays, diagnosis, cim10Code, allowedOutings, generatedPDF, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdSickLeaves = 0;
  const currentSickLeaves = getCount('sick_leaves');
  while (createdSickLeaves + currentSickLeaves < TARGETS.sickLeaves) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdSickLeaves % consultationIds.length];
    const days = 3 + (createdSickLeaves % 20);
    const start = new Date();
    start.setDate(start.getDate() - (createdSickLeaves % 45));
    const end = new Date(start);
    end.setDate(end.getDate() + days);

    const result = safeRun(insertSickLeave, [
      uuidv4(), patient, consult?.id || null, start.toISOString(), end.toISOString(),
      days, randomItem(diagnoses), 'M54.5', createdSickLeaves % 3 === 0 ? 1 : 0, null
    ], 'sick_leave');
    if (result) createdSickLeaves++;
  }
  report.created.sickLeaves = createdSickLeaves;
  report.totals.sickLeaves = getCount('sick_leaves');

  // ---------- Medical analyses ----------
  const insertMedicalAnalysis = db.prepare(`
    INSERT INTO medical_analyses (id, patientId, consultationId, analysisDate, analysisType, laboratory, results, normalValues, interpretation, status, attachmentPath, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdMedicalAnalyses = 0;
  const currentMedicalAnalyses = getCount('medical_analyses');
  const analysisTypeNames = analysisTypesCatalog.map(a => a.name);
  while (createdMedicalAnalyses + currentMedicalAnalyses < TARGETS.medicalAnalyses) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdMedicalAnalyses % consultationIds.length];
    const analysisType = randomItem(analysisTypeNames);
    const status = randomItem(['pending', 'completed', 'reviewed']);

    const result = safeRun(insertMedicalAnalysis, [
      uuidv4(), patient, consult?.id || null, randomDate(-90, 0), analysisType,
      randomItem(['Labo Central', 'Biolys', 'MedLab', 'Cytolab']),
      'Résultats dans les valeurs usuelles.', 'Voir référence laboratoire',
      'Analyse réalisée à titre de suivi.', status, null, 'Analyse de démonstration'
    ], 'medical_analysis');
    if (result) createdMedicalAnalyses++;
  }
  report.created.medicalAnalyses = createdMedicalAnalyses;
  report.totals.medicalAnalyses = getCount('medical_analyses');

  // ---------- Inventory ----------
  const inventoryCatalog = [
    { name: 'Gants latex taille M', category: 'Fourniture médicale', unit: 'boîte', purchasePrice: 800, sellingPrice: 1200 },
    { name: 'Gants latex taille L', category: 'Fourniture médicale', unit: 'boîte', purchasePrice: 850, sellingPrice: 1250 },
    { name: 'Seringues 5mL', category: 'Fourniture médicale', unit: 'boîte', purchasePrice: 600, sellingPrice: 900 },
    { name: 'Seringues 10mL', category: 'Fourniture médicale', unit: 'boîte', purchasePrice: 700, sellingPrice: 1000 },
    { name: 'Pansement adhésif', category: 'Fourniture médicale', unit: 'paquet', purchasePrice: 300, sellingPrice: 500 },
    { name: 'Bande extensible', category: 'Fourniture médicale', unit: 'rouleau', purchasePrice: 400, sellingPrice: 650 },
    { name: 'Compresses stériles', category: 'Fourniture médicale', unit: 'paquet', purchasePrice: 250, sellingPrice: 400 },
    { name: 'Paracétamol 500mg', category: 'Médicament', unit: 'boîte', purchasePrice: 150, sellingPrice: 250 },
    { name: 'Ibuprofène 400mg', category: 'Médicament', unit: 'boîte', purchasePrice: 200, sellingPrice: 350 },
    { name: 'Antiseptique cutané', category: 'Fourniture médicale', unit: 'flacon', purchasePrice: 500, sellingPrice: 800 },
    { name: 'Crème anti-inflammatoire', category: 'Médicament', unit: 'tube', purchasePrice: 450, sellingPrice: 700 },
    { name: 'Électrodes ECG', category: 'Matériel de rééducation', unit: 'paquet', purchasePrice: 1200, sellingPrice: 1800 },
    { name: 'Ballon de rééducation', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 2500, sellingPrice: 3800 },
    { name: 'Bande élastique', category: 'Matériel de rééducation', unit: 'rouleau', purchasePrice: 900, sellingPrice: 1400 },
    { name: 'Poids de poignet 1kg', category: 'Matériel de rééducation', unit: 'paire', purchasePrice: 1800, sellingPrice: 2600 },
    { name: 'Désinfectant mains', category: 'Produit d\'entretien', unit: 'flacon', purchasePrice: 700, sellingPrice: 1100 },
    { name: 'Gel échographique', category: 'Fourniture médicale', unit: 'flacon', purchasePrice: 900, sellingPrice: 1400 },
    { name: 'Test de grossesse', category: 'Fourniture médicale', unit: 'unité', purchasePrice: 300, sellingPrice: 500 },
    { name: 'Thermomètre digital', category: 'Petit matériel', unit: 'unité', purchasePrice: 1500, sellingPrice: 2200 },
    { name: 'Tensiomètre automatique', category: 'Petit matériel', unit: 'unité', purchasePrice: 8500, sellingPrice: 12000 },
    { name: 'Oxymètre de pouls', category: 'Petit matériel', unit: 'unité', purchasePrice: 3500, sellingPrice: 5000 },
    { name: 'Stéthoscope', category: 'Petit matériel', unit: 'unité', purchasePrice: 4500, sellingPrice: 6500 },
    { name: 'Marteleur réflexe', category: 'Petit matériel', unit: 'unité', purchasePrice: 600, sellingPrice: 950 },
    { name: 'Abaisse-langue bois', category: 'Fourniture médicale', unit: 'boîte', purchasePrice: 400, sellingPrice: 650 },
    { name: 'Masques chirurgicaux', category: 'Fourniture médicale', unit: 'boîte', purchasePrice: 900, sellingPrice: 1400 },
    { name: 'Gel conducteur', category: 'Matériel de rééducation', unit: 'pot', purchasePrice: 1100, sellingPrice: 1700 },
    { name: 'Sangle abdominale', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 2200, sellingPrice: 3200 },
    { name: 'Canne anglaise', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 2800, sellingPrice: 4000 },
    { name: 'Déambulateur', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 12000, sellingPrice: 16500 },
    { name: 'Attelle de poignet', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 1800, sellingPrice: 2600 },
    { name: 'Attelle de cheville', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 2000, sellingPrice: 2900 },
    { name: 'Rouleau kinesio tape', category: 'Matériel de rééducation', unit: 'rouleau', purchasePrice: 1300, sellingPrice: 1900 },
    { name: 'Bouillotte', category: 'Petit matériel', unit: 'unité', purchasePrice: 500, sellingPrice: 800 },
    { name: 'Sachet de glace instantanée', category: 'Fourniture médicale', unit: 'paquet', purchasePrice: 350, sellingPrice: 550 },
    { name: 'Coton hydrophile', category: 'Fourniture médicale', unit: 'paquet', purchasePrice: 200, sellingPrice: 350 },
    { name: 'Solution saline', category: 'Fourniture médicale', unit: 'flacon', purchasePrice: 250, sellingPrice: 400 },
    { name: 'Adhésif médical', category: 'Fourniture médicale', unit: 'rouleau', purchasePrice: 300, sellingPrice: 500 },
    { name: 'Pince à épiler chirurgicale', category: 'Petit matériel', unit: 'unité', purchasePrice: 450, sellingPrice: 700 },
    { name: 'Lampe à pupille', category: 'Petit matériel', unit: 'unité', purchasePrice: 900, sellingPrice: 1400 },
    { name: 'Otoscope', category: 'Petit matériel', unit: 'unité', purchasePrice: 18000, sellingPrice: 24000 },
    { name: 'Tapis de rééducation', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 3200, sellingPrice: 4500 },
    { name: 'Bandage cohésif', category: 'Fourniture médicale', unit: 'rouleau', purchasePrice: 350, sellingPrice: 550 },
    { name: 'Pâte à modeler thérapeutique', category: 'Matériel de rééducation', unit: 'pot', purchasePrice: 700, sellingPrice: 1100 },
    { name: 'Cones de rééducation', category: 'Matériel de rééducation', unit: 'lot', purchasePrice: 1500, sellingPrice: 2200 },
    { name: 'Poutre d\'équilibre', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 6500, sellingPrice: 9000 },
    { name: 'Vélo d\'appartement', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 28000, sellingPrice: 35000 },
    { name: 'Tapis roulant', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 95000, sellingPrice: 120000 },
    { name: 'Appareil TENS', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 15000, sellingPrice: 21000 },
    { name: 'Ultrason thérapeutique', category: 'Matériel de rééducation', unit: 'unité', purchasePrice: 45000, sellingPrice: 60000 },
    { name: 'Pompe de perfusion', category: 'Petit matériel', unit: 'unité', purchasePrice: 35000, sellingPrice: 48000 }
  ];

  const insertInventory = db.prepare(`
    INSERT INTO inventory (id, name, category, description, quantity, minQuantity, unit, purchasePrice, sellingPrice, supplier, expirationDate, location, notes, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  let createdInventory = 0;
  const currentInventory = getCount('inventory');
  while (createdInventory + currentInventory < TARGETS.inventory && createdInventory < inventoryCatalog.length) {
    const item = inventoryCatalog[(currentInventory + createdInventory) % inventoryCatalog.length];
    const existing = db.prepare('SELECT id FROM inventory WHERE name = ?').get(item.name);
    if (existing) {
      createdInventory++;
      continue;
    }

    const qty = 5 + (createdInventory % 45);
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1 + (createdInventory % 2));

    const result = safeRun(insertInventory, [
      uuidv4(), item.name, item.category, `Article de démonstration: ${item.name}`,
      qty, 5, item.unit, item.purchasePrice, item.sellingPrice,
      randomItem(['MediAlger', 'PharmaDZ', 'Global Med', 'Santé Plus']),
      exp.toISOString().slice(0, 10), 'Stock principal', 'Produit actif en démonstration'
    ], 'inventory');
    if (result) createdInventory++;
  }
  report.created.inventory = createdInventory;
  report.totals.inventory = getCount('inventory');

  // ---------- Expenses ----------
  const insertExpense = db.prepare(`
    INSERT INTO expenses (id, expenseDate, category, description, amount, paymentMethod, vendor, receiptNumber, notes, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdExpenses = 0;
  const currentExpenses = getCount('expenses');
  while (createdExpenses + currentExpenses < TARGETS.expenses) {
    const category = expenseCategoriesCatalog[createdExpenses % expenseCategoriesCatalog.length].name;
    const amount = 2000 + (createdExpenses % 50) * 1000;

    const result = safeRun(insertExpense, [
      uuidv4(), randomDate(-90, 0), category, `Dépense de démonstration: ${category}`,
      amount, randomItem(paymentMethods), randomItem(expenseVendors),
      `FAC-${20240000 + createdExpenses}`, 'Dépense générée pour la démonstration',
      randomItem([...doctorIds, ...assistantIds])
    ], 'expense');
    if (result) createdExpenses++;
  }
  report.created.expenses = createdExpenses;
  report.totals.expenses = getCount('expenses');

  // ---------- Debts ----------
  const insertDebt = db.prepare(`
    INSERT INTO debts (id, patientId, consultationId, invoiceId, amount, paidAmount, remainingAmount, dueDate, status, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdDebts = 0;
  const currentDebts = getCount('debts');
  while (createdDebts + currentDebts < TARGETS.debts) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdDebts % consultationIds.length];
    const amount = 3000 + (createdDebts % 10) * 500;
    const paid = createdDebts % 3 === 0 ? amount : (createdDebts % 4 === 0 ? amount / 2 : 0);
    const remaining = amount - paid;
    const due = new Date();
    due.setDate(due.getDate() + (createdDebts % 30));

    const result = safeRun(insertDebt, [
      uuidv4(), patient, consult?.id || null, null, amount, paid, remaining,
      due.toISOString(), remaining <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid'),
      'Créance de démonstration'
    ], 'debt');
    if (result) createdDebts++;
  }
  report.created.debts = createdDebts;
  report.totals.debts = getCount('debts');

  // ---------- Documents ----------
  const insertDocument = db.prepare(`
    INSERT INTO documents (id, patientId, consultationId, documentType, title, payload, lastPrintedAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdDocuments = 0;
  const currentDocuments = getCount('documents');
  while (createdDocuments + currentDocuments < TARGETS.documents) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdDocuments % consultationIds.length];
    const type = randomItem(documentTypes);

    const result = safeRun(insertDocument, [
      uuidv4(), patient, consult?.id || null, type,
      `${type.replace('_', ' ').toUpperCase()} - ${createdDocuments + 1}`,
      JSON.stringify({ generated: true, demo: true, index: createdDocuments }),
      createdDocuments % 2 === 0 ? randomDate(-90, 0) : null
    ], 'document');
    if (result) createdDocuments++;
  }
  report.created.documents = createdDocuments;
  report.totals.documents = getCount('documents');

  // ---------- Patient documents ----------
  const insertPatientDocument = db.prepare(`
    INSERT INTO patient_documents (id, patientId, consultationId, fileName, fileType, filePath, fileSize, description, category, uploadDate, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let createdPatientDocuments = 0;
  const currentPatientDocuments = getCount('patient_documents');
  while (createdPatientDocuments + currentPatientDocuments < TARGETS.patientDocuments) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdPatientDocuments % consultationIds.length];
    const category = randomItem(documentCategories);
    const fileName = `${category.toLowerCase().replace(/\s+/g, '_')}_${createdPatientDocuments + 1}.pdf`;

    const result = safeRun(insertPatientDocument, [
      uuidv4(), patient, consult?.id || null, fileName, 'application/pdf',
      `/demo/documents/${fileName}`, 1024 + (createdPatientDocuments % 5000),
      `Document patient de démonstration: ${category}`, category, randomDate(-90, 0)
    ], 'patient_document');
    if (result) createdPatientDocuments++;
  }
  report.created.patientDocuments = createdPatientDocuments;
  report.totals.patientDocuments = getCount('patient_documents');

  // ---------- Waiting room ----------
  const insertWaitingRoom = db.prepare(`
    INSERT INTO waiting_room (id, patientId, arrivalTime, reason, priority, assignedTo, status, calledAt, completedAt, notes, createdBy, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let createdWaitingRoom = 0;
  const currentWaitingRoom = getCount('waiting_room');
  while (createdWaitingRoom + currentWaitingRoom < TARGETS.waitingRoom) {
    const patient = pickPatient(patientIds);
    const status = randomItem(['waiting', 'called', 'completed', 'cancelled']);
    const arrival = new Date();
    arrival.setDate(arrival.getDate() - (createdWaitingRoom % 30));
    arrival.setHours(8 + (createdWaitingRoom % 10), (createdWaitingRoom % 2) * 30, 0, 0);
    const called = status !== 'waiting' ? new Date(arrival.getTime() + 15 * 60000).toISOString() : null;
    const completed = status === 'completed' ? new Date(arrival.getTime() + 45 * 60000).toISOString() : null;

    const result = safeRun(insertWaitingRoom, [
      uuidv4(), patient, arrival.toISOString(), randomItem(consultationReasons),
      createdWaitingRoom % 5 === 0 ? 1 : 0, randomItem(doctorIds), status,
      called, completed, 'Entrée salle d\'attente de démonstration',
      randomItem([...assistantIds, ...doctorIds])
    ], 'waiting_room');
    if (result) createdWaitingRoom++;
  }
  report.created.waitingRoom = createdWaitingRoom;
  report.totals.waitingRoom = getCount('waiting_room');

  // ---------- Kiné sessions ----------
  const insertKineSession = db.prepare(`
    INSERT INTO kine_sessions (id, patientId, kineId, consultationId, sessionDate, sessionNumber, duration, price, paymentStatus, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let createdKineSessions = 0;
  const currentKineSessions = getCount('kine_sessions');
  while (createdKineSessions + currentKineSessions < TARGETS.kineSessions && kineStaffIds.length > 0) {
    const patient = pickPatient(patientIds);
    const kine = randomItem(kineStaffIds);
    const price = kineStaffCatalog[kineStaffIds.indexOf(kine)]?.sessionPrice || 2000;

    const result = safeRun(insertKineSession, [
      uuidv4(), patient, kine, null, randomDate(-60, 0),
      (createdKineSessions % 12) + 1, 30 + (createdKineSessions % 15),
      price, randomItem(['paid', 'unpaid', 'partial']),
      'Séance de kinésithérapie de démonstration'
    ], 'kine_session');
    if (result) createdKineSessions++;
  }
  report.created.kineSessions = createdKineSessions;
  report.totals.kineSessions = getCount('kine_sessions');

  // ---------- Rehabilitation plans ----------
  const insertRehabPlan = db.prepare(`
    INSERT INTO rehabilitation_plans (id, patientId, consultationId, createdBy, startDate, endDate, status, shortTermObjectives, mediumTermObjectives, longTermObjectives, kinesiotherapy, kinesiotherapyFrequency, kinesiotherapyNotes, ergotherapy, ergotherapyFrequency, ergotherapyNotes, speechTherapy, speechTherapyFrequency, speechTherapyNotes, orthosis, orthosisType, orthosisNotes, wheelchair, wheelchairType, wheelchairNotes, prosthesis, prosthesisType, prosthesisNotes, otherEquipment, equipmentDetails, hydrotherapy, electrotherapy, massotherapy, totalSessions, completedSessions, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  let createdRehabPlans = 0;
  const currentRehabPlans = getCount('rehabilitation_plans');
  const rehabPlanIds = [];
  while (createdRehabPlans + currentRehabPlans < TARGETS.rehabilitationPlans) {
    const patient = pickPatient(patientIds);
    const consult = consultationIds[createdRehabPlans % consultationIds.length];
    const totalSessions = 10 + (createdRehabPlans % 20);
    const completedSessions = createdRehabPlans % (totalSessions + 1);
    const start = new Date();
    start.setDate(start.getDate() - 30 - (createdRehabPlans % 30));
    const end = new Date(start);
    end.setDate(end.getDate() + totalSessions * 3);

    const id = uuidv4();
    const result = safeRun(insertRehabPlan, [
      id, patient, consult?.id || null, randomItem(doctorIds),
      start.toISOString(), end.toISOString(), completedSessions >= totalSessions ? 'completed' : 'active',
      'Réduire la douleur et retrouver l\'amplitude articulaire',
      'Améliorer la force musculaire et la marche',
      'Reprise des activités quotidiennes et sportives',
      1, '3 séances par semaine', 'Renforcement et mobilisation',
      createdRehabPlans % 5 === 0 ? 1 : 0, '2 séances par semaine', 'Rééducation fonctionnelle',
      0, null, null,
      createdRehabPlans % 7 === 0 ? 1 : 0, 'Attelle de poignet', 'Port nocturne recommandé',
      0, null, null,
      0, null, null,
      null, null,
      createdRehabPlans % 4 === 0 ? 1 : 0, 1, createdRehabPlans % 3 === 0 ? 1 : 0,
      totalSessions, completedSessions, 'Plan de rééducation de démonstration'
    ], 'rehabilitation_plan');
    if (result) {
      createdRehabPlans++;
      rehabPlanIds.push(id);
    }
  }
  report.created.rehabilitationPlans = createdRehabPlans;
  report.totals.rehabilitationPlans = getCount('rehabilitation_plans');

  // ---------- Rehabilitation sessions ----------
  const insertRehabSession = db.prepare(`
    INSERT INTO rehabilitation_sessions (id, rehabilitationPlanId, patientId, therapistId, sessionDate, sessionType, sessionNumber, duration, techniques, exercises, observations, progressNotes, painLevel, patientFeedback, status, billedAmount, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let createdRehabSessions = 0;
  const currentRehabSessions = getCount('rehabilitation_sessions');
  while (createdRehabSessions + currentRehabSessions < TARGETS.rehabilitationSessions) {
    const planId = rehabPlanIds[createdRehabSessions % rehabPlanIds.length] || null;
    const patient = pickPatient(patientIds);
    const status = randomItem(['scheduled', 'completed', 'cancelled']);

    const result = safeRun(insertRehabSession, [
      uuidv4(), planId, patient, randomItem(kineUserIds), randomDate(-60, 0),
      randomItem(['Kinésithérapie', 'Electrothérapie', 'Massothérapie', 'Rééducation fonctionnelle']),
      (createdRehabSessions % 12) + 1, 30 + (createdRehabSessions % 15),
      'Mobilisation passive, stretching, renforcement musculaire',
      'Exercices d\'amplitude, renforcement proprioceptif',
      'Bonne tolérance, légère fatigue musculaire',
      'Amélioration progressive de la mobilité',
      createdRehabSessions % 10, 'Séance bien supportée',
      status, status === 'completed' ? 1500 : 0, 'Séance de rééducation de démonstration'
    ], 'rehabilitation_session');
    if (result) createdRehabSessions++;
  }
  report.created.rehabilitationSessions = createdRehabSessions;
  report.totals.rehabilitationSessions = getCount('rehabilitation_sessions');

  // ---------- Notifications ----------
  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, userId, type, title, message, relatedType, relatedId, isRead, scheduledFor, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const notificationTypes = ['appointment', 'payment', 'system', 'reminder', 'alert'];
  let createdNotifications = 0;
  const currentNotifications = getCount('notifications');
  while (createdNotifications + currentNotifications < TARGETS.notifications) {
    const user = randomItem(userIds);
    const type = randomItem(notificationTypes);

    const result = safeRun(insertNotification, [
      uuidv4(), user, type,
      `Notification ${type} #${createdNotifications + 1}`,
      `Ceci est un message de démonstration pour ${type}.`,
      type, uuidv4(), createdNotifications % 3 === 0 ? 1 : 0,
      randomDate(0, 7)
    ], 'notification');
    if (result) createdNotifications++;
  }
  report.created.notifications = createdNotifications;
  report.totals.notifications = getCount('notifications');

  // ---------- Imaging examples for Bounouala Mohamed Islem ----------
  try {
    const targetPatient = db.prepare(
      `SELECT id, firstName, lastName FROM patients WHERE lower(lastName) LIKE ? AND lower(firstName) LIKE ? ORDER BY createdAt ASC LIMIT 1`
    ).get('%bounouala%', '%mohamed%');

    if (targetPatient?.id) {
      const demoImagePath = path.resolve(process.cwd(), 'assets', 'logo.png');
      const imageFamilies = ['Radiographie', 'IRM', 'Scanner CT'];
      const checkAttachment = db.prepare(
        'SELECT id FROM patient_attachments WHERE patientId = ? AND examFamily = ? AND sourceType = ? LIMIT 1'
      );
      const insertAttachment = db.prepare(`
        INSERT INTO patient_attachments (id, patientId, consultationId, fileName, filePath, mimeType, fileSize, examFamily, sourceType, sourceLabel, notes, createdAt, updatedAt)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      for (const family of imageFamilies) {
        const exists = checkAttachment.get(targetPatient.id, family, 'seed-demo');
        if (exists) continue;
        const fileName = `${family.replace(/\s+/g, '_').toLowerCase()}_demo_${targetPatient.id.slice(0, 8)}.png`;
        safeRun(insertAttachment, [uuidv4(), targetPatient.id, fileName, demoImagePath, 'image/png', 0, family, 'seed-demo', 'Exemple généré automatiquement', `${family} exemple (démo)`], 'patient_attachment');
      }
    }
  } catch (err) {
    console.log(`⚠️ Imaging demo seed error: ${err.message}`);
  }

  // ---------- Totals ----------
  report.totals.users = getCount('users');
  report.totals.kineStaff = getCount('kine_staff');
  report.totals.medications = getCount('medications');
  report.totals.analysisTypes = getCount('analysis_types');
  report.totals.expenseCategories = getCount('expense_categories');

  console.log('🎉 Demo database seeding complete!');
  console.log(report);
  return report;
}

/**
 * Clear all data from database (except users and settings)
 * Useful for testing/resetting
 */
export function clearAllData() {
  console.log('🗑️ Clearing all data from database...');
  
  // Helper to safely delete from table (ignore if table doesn't exist)
  const safeDelete = (tableName) => {
    try {
      db.exec(`DELETE FROM ${tableName}`);
    } catch (e) {
      console.log(`⚠️ Table ${tableName} skipped: ${e.message}`);
    }
  };
  
  try {
    // Clear in order to respect foreign key constraints
    safeDelete('kine_sessions');
    safeDelete('rehabilitation_sessions');
    safeDelete('rehabilitation_plans');
    safeDelete('functional_evaluations');
    safeDelete('prescriptions');
    safeDelete('sick_leaves');
    safeDelete('consultations');
    safeDelete('payments');
    safeDelete('debts');
    safeDelete('waiting_room');
    safeDelete('patient_documents');
    safeDelete('appointments');
    safeDelete('notifications');
    safeDelete('expenses');
    safeDelete('inventory');
    safeDelete('kine_staff');
    safeDelete('patients');
    
    console.log('✅ All data cleared successfully');
    return { success: true, message: 'Toutes les données ont été supprimées' };
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ferme la base de données
 */
export function closeDatabase() {
  if (db) {
    clearStatementCache();
    db.close();
    db = null;
  }
}

// ============ SUPER ADMIN & LICENSE DEFAULTS ============

/**
 * Identifiants du super admin (développeur)
 * ⚠️ NE PAS MODIFIER - Ces identifiants sont dans le fichier ADMIN_CREDENTIALS.txt
 */
const SUPER_ADMIN = {
  username: 'superadmin',
  password: 'MedPro@2024!',
  fullName: 'Super Administrateur'
};

const MASTER_LICENSE_KEY = 'MEDPRO-MASTER-2024-ACTIVATED';

/**
 * Hash le mot de passe avec SHA256
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Crée le super admin par défaut s'il n'existe pas
 */
function createDefaultSuperAdmin() {
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(SUPER_ADMIN.username);
    
    if (!existing) {
      const id = uuidv4();
      const passwordHash = hashPassword(SUPER_ADMIN.password);
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO users (id, username, password, fullName, role, isAdmin, isSuperAdmin, isActive, createdAt)
        VALUES (?, ?, ?, ?, 'admin', 1, 1, 1, ?)
      `).run(id, SUPER_ADMIN.username, passwordHash, SUPER_ADMIN.fullName, now);
      
      console.log('✅ Super admin créé par défaut');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la création du super admin:', error);
  }
}

/**
 * Crée les licences par défaut si elles n'existent pas
 */
function createDefaultLicenses() {
  try {
    const unlimitedAlreadyExists = db.prepare('SELECT id FROM licenses WHERE key = ?').get(UNLIMITED_LICENSE_KEY);
    const licenses = [
      {
        key: TRIAL_LICENSE_KEY,
        clientName: 'Licence Essai 7 Jours',
        expirationDate: null
      },
      {
        key: ANNUAL_LICENSE_KEY,
        clientName: 'Licence 1 An',
        expirationDate: null
      },
      {
        key: UNLIMITED_LICENSE_KEY,
        clientName: 'Licence Illimitée',
        expirationDate: null
      }
    ];

    const existingMaster = db.prepare('SELECT id FROM licenses WHERE key = ?').get(MASTER_LICENSE_KEY);
    if (existingMaster) {
      const annualAlreadyExists = db.prepare('SELECT id FROM licenses WHERE key = ?').get(ANNUAL_LICENSE_KEY);
      if (annualAlreadyExists) {
        db.prepare('DELETE FROM licenses WHERE key = ?').run(MASTER_LICENSE_KEY);
      } else {
        db.prepare(`
          UPDATE licenses
          SET key = ?, clientName = 'Licence 1 An', expirationDate = NULL
          WHERE key = ?
        `).run(ANNUAL_LICENSE_KEY, MASTER_LICENSE_KEY);
      }
      console.log('✅ Ancienne licence master migrée vers licence annuelle');
    }

    const insertLicense = db.prepare(`
      INSERT INTO licenses (id, key, clientName, generatedDate, expirationDate, activated, status)
      VALUES (?, ?, ?, ?, ?, 0, 'pending')
    `);

    for (const license of licenses) {
      const existing = db.prepare('SELECT id FROM licenses WHERE key = ?').get(license.key);
      if (!existing) {
        insertLicense.run(uuidv4(), license.key, license.clientName, new Date().toISOString(), license.expirationDate);
        console.log(`✅ Licence créée: ${license.key}`);
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors de la création des licences par défaut:', error);
  }
}

/**
 * Données par défaut pour Médecine Physique et Fonctionnelle
 */
function ensureMPRDefaultData() {
  try {
    // Vérifier si les échelles MPR sont déjà insérées
    const scalesExist = db.prepare('SELECT COUNT(*) as count FROM analysis_types WHERE category = ?').get('Échelle MPR');
    
    if (!scalesExist || scalesExist.count === 0) {
      const mprScales = [
        // Échelles de douleur
        { name: 'EVA (Échelle Visuelle Analogique)', category: 'Échelle MPR', description: 'Évaluation de la douleur de 0 à 10' },
        { name: 'DN4 (Douleur Neuropathique)', category: 'Échelle MPR', description: 'Questionnaire de dépistage des douleurs neuropathiques' },
        
        // Échelles d\'autonomie
        { name: 'Index de Barthel', category: 'Échelle MPR', description: 'Évaluation des activités de la vie quotidienne (AVQ), score 0-100' },
        { name: 'FIM (Functional Independence Measure)', category: 'Échelle MPR', description: 'Mesure de l\'indépendance fonctionnelle, 18-126' },
        { name: 'MIF (Mesure de l\'Indépendance Fonctionnelle)', category: 'Échelle MPR', description: 'Version française du FIM' },
        
        // Échelles de spasticité
        { name: 'Échelle d\'Ashworth Modifiée', category: 'Échelle MPR', description: 'Évaluation du tonus musculaire, 0-4' },
        { name: 'Échelle de Tardieu', category: 'Échelle MPR', description: 'Évaluation de la spasticité' },
        
        // Échelles de force
        { name: 'MRC (Medical Research Council)', category: 'Échelle MPR', description: 'Cotation de la force musculaire, 0-5' },
        
        // Échelles d\'équilibre et marche
        { name: 'Test de Tinetti', category: 'Échelle MPR', description: 'Évaluation de l\'équilibre et de la marche' },
        { name: 'Test de Berg', category: 'Échelle MPR', description: 'Évaluation de l\'équilibre, 0-56' },
        { name: 'TUG (Timed Up and Go)', category: 'Échelle MPR', description: 'Test de mobilité fonctionnelle' },
        { name: 'Test de marche 6 minutes', category: 'Échelle MPR', description: 'Évaluation de l\'endurance à la marche' },
        { name: 'Test de marche 10 mètres', category: 'Échelle MPR', description: 'Évaluation de la vitesse de marche' },
        
        // Échelles neurologiques
        { name: 'NIHSS', category: 'Échelle MPR', description: 'National Institutes of Health Stroke Scale' },
        { name: 'Rankin Modifié', category: 'Échelle MPR', description: 'Échelle de handicap global post-AVC' },
        { name: 'Glasgow Coma Scale', category: 'Échelle MPR', description: 'Évaluation du niveau de conscience' },
        
        // Échelles de qualité de vie
        { name: 'SF-36', category: 'Échelle MPR', description: 'Questionnaire de qualité de vie' },
        { name: 'EQ-5D', category: 'Échelle MPR', description: 'Évaluation de la qualité de vie liée à la santé' },
        
        // Échelles spécifiques
        { name: 'ASIA (Lésion médullaire)', category: 'Échelle MPR', description: 'Classification des lésions médullaires' },
        { name: 'Oswestry (Lombalgie)', category: 'Échelle MPR', description: 'Questionnaire d\'incapacité lombaire' },
        { name: 'WOMAC (Arthrose)', category: 'Échelle MPR', description: 'Évaluation de l\'arthrose du genou et de la hanche' }
      ];
      
      const insertScale = db.prepare(`
        INSERT INTO analysis_types (id, name, category, description, isActive, createdAt)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
      `);
      
      for (const scale of mprScales) {
        insertScale.run(uuidv4(), scale.name, scale.category, scale.description);
      }
      
      console.log('✅ Échelles MPR créées');
    }
    
    // Ajouter des catégories d'équipement MPR
    const equipmentCategories = [
      'Orthèse',
      'Prothèse',
      'Fauteuil roulant',
      'Aide à la marche',
      'Matériel de rééducation',
      'Appareillage',
      'Lit médicalisé',
      'Coussin anti-escarre',
      'Attelle',
      'Corset',
      'Collier cervical',
      'Semelles orthopédiques'
    ];
    
    console.log('✅ Données MPR par défaut créées');
    
  } catch (error) {
    console.error('❌ Erreur création données MPR:', error);
  }
}

/**
 * Exécute une requête SELECT
 */
export function query(sql, params = []) {
  const statement = getCachedStatement(sql);
  return statement.all(...params);
}

/**
 * Exécute une requête INSERT, UPDATE, DELETE
 */
export function run(sql, params = []) {
  const statement = getCachedStatement(sql);
  return statement.run(...params);
}

/**
 * Exécute une requête et retourne le premier résultat
 */
export function queryOne(sql, params = []) {
  const statement = getCachedStatement(sql);
  return statement.get(...params);
}

/**
 * Sauvegarde la base de données (backup)
 */
export function backupDatabase() {
  try {
    const fs = require('fs');
    const sourceDb = path.join(app.getPath('userData'), 'physiocare.db');
    const backupDir = path.join(app.getPath('userData'), 'backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
    
    fs.copyFileSync(sourceDb, backupPath);
    console.log(`✅ Backup créé: ${backupPath}`);
    
    return backupPath;
  } catch (error) {
    console.error('❌ Erreur lors du backup:', error);
    throw error;
  }
}
