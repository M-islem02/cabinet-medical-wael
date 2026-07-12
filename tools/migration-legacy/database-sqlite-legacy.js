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
      customTreatmentTypes TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    db.exec(`ALTER TABLE settings ADD COLUMN customTreatmentTypes TEXT`);
  } catch (e) { /* Column exists */ }
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
  
  // Add treatment plans tables (multi-specialty)
  createTreatmentPlansTables();
  
  // Add SMS and Cloud Sync tables
  createSMSTables();
  createCloudSyncTables();

  // Add Inventory & POS module tables (Sous-plan F)
  createInventoryModuleTables();

  // Add Equipment module tables (Sous-plan G)
  createEquipmentTables();

  ensureSchemaUpgrades();
  ensureDefaultData();
  ensureDefaultCategories();
  ensureMPRDefaultData();
}

// ========== MODULE INVENTAIRE & POINT DE VENTE (Sous-plan F) ==========

function createInventoryModuleTables() {
  // Fournisseurs
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contactName TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      specialty TEXT,
      isActive INTEGER DEFAULT 1,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Inventory item master data (existing table extended via migrations below)
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
      supplierId TEXT,
      expirationDate TEXT,
      location TEXT,
      photoPath TEXT,
      notes TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplierId) REFERENCES suppliers(id) ON DELETE SET NULL
    )
  `);

  // Lots / traçabilité FEFO
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_lots (
      id TEXT PRIMARY KEY,
      inventoryId TEXT NOT NULL,
      supplierId TEXT,
      lotNumber TEXT,
      purchaseDate TEXT,
      expirationDate TEXT,
      initialQuantity INTEGER NOT NULL,
      remainingQuantity INTEGER NOT NULL,
      unitPrice REAL DEFAULT 0,
      notes TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY(supplierId) REFERENCES suppliers(id) ON DELETE SET NULL
    )
  `);

  // Purchase orders
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      supplierId TEXT,
      orderDate TEXT DEFAULT CURRENT_TIMESTAMP,
      expectedDeliveryDate TEXT,
      status TEXT DEFAULT 'draft',
      totalAmount REAL DEFAULT 0,
      invoiceNumber TEXT,
      invoiceAmount REAL,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplierId) REFERENCES suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      purchaseOrderId TEXT NOT NULL,
      inventoryId TEXT NOT NULL,
      orderedQuantity INTEGER NOT NULL,
      receivedQuantity INTEGER DEFAULT 0,
      unitPrice REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE
    )
  `);

  // Point of Sale sales
  db.exec(`
    CREATE TABLE IF NOT EXISTS pos_sales (
      id TEXT PRIMARY KEY,
      patientId TEXT,
      customerName TEXT,
      saleDate TEXT DEFAULT CURRENT_TIMESTAMP,
      totalAmount REAL DEFAULT 0,
      discountAmount REAL DEFAULT 0,
      discountPercent REAL DEFAULT 0,
      finalAmount REAL DEFAULT 0,
      paymentMethod TEXT DEFAULT 'Espèces',
      paymentId TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE SET NULL,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(paymentId) REFERENCES payments(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pos_sale_items (
      id TEXT PRIMARY KEY,
      posSaleId TEXT NOT NULL,
      inventoryId TEXT NOT NULL,
      lotId TEXT,
      quantity INTEGER NOT NULL,
      unitPrice REAL DEFAULT 0,
      purchasePrice REAL DEFAULT 0,
      totalPrice REAL DEFAULT 0,
      FOREIGN KEY(posSaleId) REFERENCES pos_sales(id) ON DELETE CASCADE,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY(lotId) REFERENCES inventory_lots(id) ON DELETE SET NULL
    )
  `);

  // Acte -> consommables par défaut (Sous-plan F5)
  db.exec(`
    CREATE TABLE IF NOT EXISTS act_consumables (
      id TEXT PRIMARY KEY,
      actType TEXT NOT NULL,
      inventoryId TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      specialty TEXT DEFAULT 'dentistry',
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE
    )
  `);

  // Migrations for existing installations must run before indexes that depend on the columns.
  try { db.exec(`ALTER TABLE inventory ADD COLUMN supplierId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE inventory ADD COLUMN photoPath TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE inventory_lots ADD COLUMN supplierId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE inventory_lots ADD COLUMN updatedAt TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN supplierId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN invoiceNumber TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN invoiceAmount REAL`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE purchase_orders ADD COLUMN updatedAt TEXT`); } catch (e) { /* exists */ }

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_lots_inventory ON inventory_lots(inventoryId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiration ON inventory_lots(expirationDate)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_lots_supplier ON inventory_lots(supplierId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplierId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplierId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchaseOrderId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pos_sales_patient ON pos_sales(patientId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(posSaleId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_act_consumables_act ON act_consumables(actType)`);

  // Extend inventory_movements with lot and sale references
  try { db.exec(`ALTER TABLE inventory_movements ADD COLUMN lotId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE inventory_movements ADD COLUMN posSaleId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE inventory_movements ADD COLUMN purchaseOrderId TEXT`); } catch (e) { /* exists */ }

  console.log('✅ Inventory & POS module tables created');
}

// ========== MODULE ÉQUIPEMENT (Sous-plan G) ==========

function createEquipmentTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serialNumber TEXT,
      purchaseDate TEXT,
      warrantyEnd TEXT,
      assignedRoom TEXT,
      assignedDoctorId TEXT,
      status TEXT DEFAULT 'available',
      lastMaintenanceDate TEXT,
      nextMaintenanceDate TEXT,
      notes TEXT,
      specificFields TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(assignedDoctorId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_maintenance (
      id TEXT PRIMARY KEY,
      equipmentId TEXT NOT NULL,
      maintenanceDate TEXT NOT NULL,
      maintenanceType TEXT NOT NULL,
      cost REAL DEFAULT 0,
      technician TEXT,
      supplierId TEXT,
      notes TEXT,
      performedBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id) ON DELETE CASCADE,
      FOREIGN KEY(supplierId) REFERENCES suppliers(id) ON DELETE SET NULL,
      FOREIGN KEY(performedBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_eq ON equipment_maintenance(equipmentId)`);

  // Migration: add equipmentId to plan_equipment_usage
  try { db.exec(`ALTER TABLE plan_equipment_usage ADD COLUMN equipmentId TEXT`); } catch (e) { /* exists */ }

  console.log('✅ Equipment module tables created');
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
      enabledSpecialties TEXT DEFAULT '["general"]',
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
    db.exec(`ALTER TABLE package_config ADD COLUMN enabledSpecialties TEXT DEFAULT '["general"]'`);
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
    db.exec(`
      UPDATE package_config
      SET enabledSpecialties =
        '["general"' ||
        CASE WHEN featureRehabilitation = 1 OR featureKineStaff = 1 THEN ',"mpr"' ELSE '' END ||
        CASE WHEN featureCardiology = 1 THEN ',"cardiology"' ELSE '' END ||
        CASE WHEN featureDentistry = 1 THEN ',"dentistry"' ELSE '' END ||
        ']'
      WHERE enabledSpecialties IS NULL
         OR TRIM(enabledSpecialties) = ''
         OR (enabledSpecialties = '["general"]' AND (featureRehabilitation = 1 OR featureKineStaff = 1 OR featureCardiology = 1 OR featureDentistry = 1))
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

  // Migrations: add missing columns to dental_treatments
  try { db.exec(`ALTER TABLE dental_treatments ADD COLUMN status TEXT DEFAULT 'proposed'`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE dental_treatments ADD COLUMN planId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE dental_treatments ADD COLUMN doctorId TEXT`); } catch (e) { /* exists */ }
  try { db.exec(`ALTER TABLE dental_treatments ADD COLUMN paid REAL DEFAULT 0`); } catch (e) { /* exists */ }

  console.log('✅ Dentistry tables created');
}

/**
 * Create treatment plans tables (multi-specialty: dentistry, MPR, etc.)
 */
function createTreatmentPlansTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS treatment_plans (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      title TEXT NOT NULL,
      treatmentType TEXT,
      description TEXT,
      specialty TEXT DEFAULT 'dentistry',
      totalCost REAL DEFAULT 0,
      totalPaid REAL DEFAULT 0,
      sessionsCount INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      createdBy TEXT,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_payment_sessions (
      id TEXT PRIMARY KEY,
      planId TEXT NOT NULL,
      sessionNumber INTEGER NOT NULL,
      scheduledDate TEXT,
      paidDate TEXT,
      expectedAmount REAL DEFAULT 0,
      paidAmount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      recordedBy TEXT,
      paymentId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(planId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(recordedBy) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_equipment_usage (
      id TEXT PRIMARY KEY,
      planId TEXT NOT NULL,
      inventoryId TEXT NOT NULL,
      usageDate TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(planId) REFERENCES treatment_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Treatment plans tables created');
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

  // Verify and add columns for treatment_plans to support multi-specialty plans
  ensureColumnExists('treatment_plans', 'patientId', 'TEXT NOT NULL');
  ensureColumnExists('treatment_plans', 'title', 'TEXT NOT NULL');
  ensureColumnExists('treatment_plans', 'treatmentType', 'TEXT');
  ensureColumnExists('treatment_plans', 'description', 'TEXT');
  ensureColumnExists('treatment_plans', 'specialty', "TEXT DEFAULT 'dentistry'");
  ensureColumnExists('treatment_plans', 'totalCost', 'REAL DEFAULT 0');
  ensureColumnExists('treatment_plans', 'totalPaid', 'REAL DEFAULT 0');
  ensureColumnExists('treatment_plans', 'sessionsCount', 'INTEGER DEFAULT 1');
  ensureColumnExists('treatment_plans', 'status', "TEXT DEFAULT 'active'");
  ensureColumnExists('treatment_plans', 'createdBy', 'TEXT');
  ensureColumnExists('treatment_plans', 'notes', 'TEXT');
  ensureColumnExists('treatment_plans', 'createdAt', 'TEXT DEFAULT CURRENT_TIMESTAMP');
  ensureColumnExists('treatment_plans', 'updatedAt', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  // Verify and add columns for plan_payment_sessions to support installment billing
  ensureColumnExists('plan_payment_sessions', 'planId', 'TEXT NOT NULL');
  ensureColumnExists('plan_payment_sessions', 'sessionNumber', 'INTEGER NOT NULL');
  ensureColumnExists('plan_payment_sessions', 'scheduledDate', 'TEXT');
  ensureColumnExists('plan_payment_sessions', 'paidDate', 'TEXT');
  ensureColumnExists('plan_payment_sessions', 'expectedAmount', 'REAL DEFAULT 0');
  ensureColumnExists('plan_payment_sessions', 'paidAmount', 'REAL DEFAULT 0');
  ensureColumnExists('plan_payment_sessions', 'status', "TEXT DEFAULT 'pending'");
  ensureColumnExists('plan_payment_sessions', 'notes', 'TEXT');
  ensureColumnExists('plan_payment_sessions', 'recordedBy', 'TEXT');
  ensureColumnExists('plan_payment_sessions', 'paymentId', 'TEXT');
  ensureColumnExists('plan_payment_sessions', 'createdAt', 'TEXT DEFAULT CURRENT_TIMESTAMP');
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
 * Seeds test data for development/testing
 */
export function seedTestData() {
  console.log('🌱 Seeding test data...');
  
  // Test patients data - using unique phones to prevent duplicates
  const patients = [
    { firstName: 'Mohammed', lastName: 'BENALI', phone: '0555123456', dateOfBirth: '1985-03-15', gender: 'M', address: '12 Rue des Oliviers, Alger', email: 'mohammed.benali@email.dz' },
    { firstName: 'Fatima', lastName: 'KHEDDAR', phone: '0661234567', dateOfBirth: '1992-07-22', gender: 'F', address: '45 Boulevard Mohamed V, Oran', email: 'fatima.kheddar@email.dz' },
    { firstName: 'Ahmed', lastName: 'BOUALEM', phone: '0770345678', dateOfBirth: '1978-11-08', gender: 'M', address: '8 Cité des Roses, Constantine', email: 'ahmed.boualem@email.dz' },
    { firstName: 'Amina', lastName: 'CHERIFI', phone: '0550456789', dateOfBirth: '1995-02-28', gender: 'F', address: '23 Rue de la Liberté, Annaba', email: 'amina.cherifi@email.dz' },
    { firstName: 'Youcef', lastName: 'MEZIANE', phone: '0667567890', dateOfBirth: '1988-09-12', gender: 'M', address: '67 Avenue de l\'Indépendance, Blida', email: 'youcef.meziane@email.dz' },
    { firstName: 'Nadia', lastName: 'HAMIDI', phone: '0778678901', dateOfBirth: '1980-05-30', gender: 'F', address: '15 Rue Ben Badis, Sétif', email: 'nadia.hamidi@email.dz' },
    { firstName: 'Karim', lastName: 'SLIMANI', phone: '0551789012', dateOfBirth: '1970-12-05', gender: 'M', address: '31 Cité El Firdous, Tizi Ouzou', email: 'karim.slimani@email.dz' },
    { firstName: 'Samira', lastName: 'BOUAZZA', phone: '0662890123', dateOfBirth: '2000-08-17', gender: 'F', address: '9 Boulevard Zighoud Youcef, Béjaïa', email: 'samira.bouazza@email.dz' },
  ];

  // Generate many synthetic patients for pagination/load testing
  const firstNames = ['Yacine', 'Lina', 'Sabrina', 'Amine', 'Nour', 'Sara', 'Imane', 'Riad', 'Sofiane', 'Meriem', 'Karim', 'Nadia'];
  const lastNames = ['Belaid', 'Mansouri', 'Ait Ali', 'Khelifi', 'Touati', 'Bouzid', 'Hamzaoui', 'Abidi', 'Kherradji', 'Mebarki', 'Haddad', 'Bensalem'];
  const cities = ['Alger', 'Oran', 'Constantine', 'Annaba', 'Sétif', 'Blida', 'Béjaïa', 'Tizi Ouzou'];
  const EXTRA_PATIENTS_COUNT = 140;

  for (let i = 0; i < EXTRA_PATIENTS_COUNT; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = `${lastNames[i % lastNames.length]} ${i + 1}`;
    const year = 1965 + (i % 36);
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    const phone = `06${String(10000000 + i).slice(-8)}`;
    patients.push({
      firstName,
      lastName,
      phone,
      dateOfBirth: `${year}-${month}-${day}`,
      gender: i % 2 === 0 ? 'M' : 'F',
      address: `${10 + i} Rue Exemple, ${cities[i % cities.length]}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@demo-medcare.dz`,
      socialSecurityNumber: `${String(1000000000000 + i).slice(0, 13)}`
    });
  }

  const patientIds = [];
  
  // Insert patients - check by firstName + lastName + dateOfBirth to avoid duplicates
  for (const patient of patients) {
    try {
      // Check if patient already exists (by name + date of birth OR by phone)
      const existingByName = db.prepare('SELECT id FROM patients WHERE firstName = ? AND lastName = ? AND dateOfBirth = ?')
        .get(patient.firstName, patient.lastName, patient.dateOfBirth);
      const existingByPhone = db.prepare('SELECT id FROM patients WHERE phone = ?').get(patient.phone);
      
      if (existingByName) {
        patientIds.push(existingByName.id);
        console.log(`⏩ Patient exists (by name): ${patient.firstName} ${patient.lastName}`);
      } else if (existingByPhone) {
        patientIds.push(existingByPhone.id);
        console.log(`⏩ Patient exists (by phone): ${patient.firstName} ${patient.lastName}`);
      } else {
        const id = uuidv4();
        db.prepare(`
          INSERT INTO patients (id, firstName, lastName, phone, dateOfBirth, gender, address, email, socialSecurityNumber, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          id,
          patient.firstName,
          patient.lastName,
          patient.phone,
          patient.dateOfBirth,
          patient.gender,
          patient.address,
          patient.email,
          patient.socialSecurityNumber || null
        );
        patientIds.push(id);
        console.log(`✅ Added patient: ${patient.firstName} ${patient.lastName}`);
      }
    } catch (err) {
      console.log(`⚠️ Patient error: ${err.message}`);
    }
  }

  // Kinésithérapeutes - check for duplicates
  const kines = [
    { firstName: 'Rachid', lastName: 'BELKACEM', phone: '0555111222', email: 'r.belkacem@kine.dz', specialty: 'Rééducation orthopédique', sessionPrice: 2000 },
    { firstName: 'Karima', lastName: 'OULD ALI', phone: '0666222333', email: 'k.ouldali@kine.dz', specialty: 'Kinésithérapie respiratoire', sessionPrice: 2500 },
    { firstName: 'Sofiane', lastName: 'HADDAD', phone: '0777333444', email: 's.haddad@kine.dz', specialty: 'Rééducation neurologique', sessionPrice: 3000 },
  ];

  const kineIds = [];
  for (const kine of kines) {
    try {
      const existingByName = db.prepare('SELECT id FROM kine_staff WHERE firstName = ? AND lastName = ?')
        .get(kine.firstName, kine.lastName);
      const existingByPhone = db.prepare('SELECT id FROM kine_staff WHERE phone = ?').get(kine.phone);
      
      if (existingByName) {
        kineIds.push(existingByName.id);
        console.log(`⏩ Kiné exists: ${kine.firstName} ${kine.lastName}`);
      } else if (existingByPhone) {
        kineIds.push(existingByPhone.id);
        console.log(`⏩ Kiné exists (by phone): ${kine.firstName} ${kine.lastName}`);
      } else {
        const id = uuidv4();
        db.prepare(`
          INSERT INTO kine_staff (id, firstName, lastName, phone, email, specialty, sessionPrice, isActive, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
        `).run(id, kine.firstName, kine.lastName, kine.phone, kine.email, kine.specialty, kine.sessionPrice);
        kineIds.push(id);
        console.log(`✅ Added kinésithérapeute: ${kine.firstName} ${kine.lastName}`);
      }
    } catch (err) {
      console.log(`⚠️ Kiné error: ${err.message}`);
    }
  }

  // Consultations
  const consultationTypes = ['Première consultation', 'Suivi', 'Contrôle', 'Urgence'];
  const diagnoses = [
    'Lombalgie chronique - L4-L5',
    'Gonarthrose bilatérale',
    'Cervicalgie post-traumatique',
    'Tendinite de la coiffe des rotateurs',
    'Capsulite rétractile épaule droite',
    'Syndrome du canal carpien',
    'Entorse cheville grade II',
    'Sciatique S1 gauche',
  ];
  const reasons = [
    'Douleur dorsale irradiant vers le membre inférieur',
    'Raideur articulaire matinale',
    'Difficulté à la marche',
    'Douleur à l\'épaule lors des mouvements',
    'Engourdissements des doigts',
    'Limitation des amplitudes articulaires',
  ];

  const insertConsultation = db.prepare(`
    INSERT INTO consultations (id, patientId, consultationDate, consultationType, reason, diagnosis, treatment, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const numConsults = 2 + Math.floor(Math.random() * 3);
    
    for (let j = 0; j < numConsults; j++) {
      const consultId = uuidv4();
      const daysAgo = Math.floor(Math.random() * 30);
      const consultDate = new Date();
      consultDate.setDate(consultDate.getDate() - daysAgo);
      
      const type = consultationTypes[Math.floor(Math.random() * consultationTypes.length)];
      const reason = reasons[Math.floor(Math.random() * reasons.length)];
      const diagnosis = diagnoses[Math.floor(Math.random() * diagnoses.length)];
      
      try {
        insertConsultation.run(consultId, patientId, consultDate.toISOString(), type, reason, diagnosis, 'Rééducation fonctionnelle - 10 séances', 'Patient coopérant');
      } catch (err) {
        console.error('Error inserting consultation:', err.message);
      }
    }
  }

  // Prescriptions
  const medications = [
    { name: 'Paracétamol 1g', dosage: '1 comprimé 3 fois par jour', duration: '7 jours' },
    { name: 'Ibuprofène 400mg', dosage: '1 comprimé 2 fois par jour après repas', duration: '5 jours' },
    { name: 'Myorelaxant (Thiocolchicoside)', dosage: '1 comprimé matin et soir', duration: '10 jours' },
    { name: 'Vitamine D3 200000 UI', dosage: '1 ampoule par mois', duration: '3 mois' },
    { name: 'Kinésithérapie', dosage: '10 séances de rééducation', duration: '5 semaines' },
  ];

  const insertPrescription = db.prepare(`
    INSERT INTO prescriptions (id, patientId, prescriptionDate, medications, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  for (let i = 0; i < Math.min(patientIds.length, 60); i++) {
    const prescId = uuidv4();
    const prescDate = new Date();
    prescDate.setDate(prescDate.getDate() - Math.floor(Math.random() * 15));
    
    const numMeds = 2 + Math.floor(Math.random() * 2);
    const selectedMeds = medications.slice(0, numMeds);
    
    try {
      insertPrescription.run(prescId, patientIds[i], prescDate.toISOString(), JSON.stringify(selectedMeds), 'À prendre selon les indications');
      console.log(`✅ Added prescription for patient ${i + 1}`);
    } catch (err) {}
  }

  // Payments
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, patientId, amount, paymentMethod, paymentDate, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const paymentMethods = ['Espèces', 'Carte', 'Virement'];
  
  for (let i = 0; i < Math.min(patientIds.length, 90); i++) {
    const paymentId = uuidv4();
    const paymentDate = new Date();
    paymentDate.setDate(paymentDate.getDate() - Math.floor(Math.random() * 20));
    
    const amount = [1500, 2000, 2500, 3000, 3500][Math.floor(Math.random() * 5)];
    const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    
    try {
      insertPayment.run(paymentId, patientIds[i], amount, method, paymentDate.toISOString(), 'Consultation');
      console.log(`✅ Added payment: ${amount} DZD`);
    } catch (err) {
      console.log(`⚠️ Payment error: ${err.message}`);
    }
  }

  // Today's consultations
  const today = new Date().toISOString();
  for (let i = 0; i < 10 && i < patientIds.length; i++) {
    const consultId = uuidv4();
    try {
      insertConsultation.run(consultId, patientIds[i], today, 'Suivi', 'Consultation du jour', diagnoses[i], 'Traitement prescrit', 'Consultation test');
      console.log(`✅ Added today's consultation ${i + 1}`);
    } catch (err) {
      console.error('Error inserting today consultation:', err.message);
    }
  }

  // Appointments (RDV) - large sample for agenda and daily view
  const insertAppointment = db.prepare(`
    INSERT INTO appointments (id, patientId, appointmentDateTime, appointmentType, reason, status, notes, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const appointmentTypes = ['Consultation', 'Contrôle', 'Rééducation', 'Kinésithérapie'];
  const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'pending'];
  let appointmentsCount = 0;

  for (let i = 0; i < Math.min(patientIds.length, 120); i++) {
    const patientId = patientIds[i];
    const rdvPerPatient = 2 + Math.floor(Math.random() * 3);

    for (let j = 0; j < rdvPerPatient; j++) {
      const daysOffset = Math.floor(Math.random() * 30) - 10;
      const slotHour = 7 + (j % 11);
      const slotMinute = j % 2 === 0 ? 0 : 30;
      const dt = new Date();
      dt.setDate(dt.getDate() + daysOffset);
      dt.setHours(slotHour, slotMinute, 0, 0);

      try {
        insertAppointment.run(
          uuidv4(),
          patientId,
          dt.toISOString().slice(0, 19).replace('T', ' '),
          appointmentTypes[(i + j) % appointmentTypes.length],
          'Suivi médical programmé',
          appointmentStatuses[(i + j) % appointmentStatuses.length],
          'Donnée test volumineuse'
        );
        appointmentsCount += 1;
      } catch (err) {
        console.log(`⚠️ Appointment error: ${err.message}`);
      }
    }
  }

  // Add kiné sessions for some patients
  if (kineIds.length > 0) {
    const insertKineSession = db.prepare(`
      INSERT INTO kine_sessions (id, patientId, kineId, sessionDate, sessionNumber, duration, price, paymentStatus, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Create sessions for the past week
    for (let day = 0; day < 7; day++) {
      const sessionsPerDay = 2 + Math.floor(Math.random() * 3); // 2-4 sessions per day
      
      for (let s = 0; s < sessionsPerDay && s < Math.min(patientIds.length, kineIds.length); s++) {
        const sessionId = uuidv4();
        const sessionDate = new Date();
        sessionDate.setDate(sessionDate.getDate() - day);
        
        const kineIdx = s % kineIds.length;
        const patientIdx = (s + day) % patientIds.length;
        const kine = kines[kineIdx];
        
        try {
          insertKineSession.run(
            sessionId,
            patientIds[patientIdx],
            kineIds[kineIdx],
            sessionDate.toISOString(),
            day + 1, // Session number
            30, // Duration
            kine.sessionPrice,
            day < 3 ? 'paid' : 'unpaid', // Recent sessions unpaid
            'Séance de rééducation'
          );
          console.log(`✅ Added kiné session for day -${day}`);
        } catch (err) {
          console.error('Error inserting kine session:', err.message);
        }
      }
    }
  }

  // Add imaging examples for patient: Bounouala Mohamed Islem
  try {
    const targetPatient = db.prepare(
      `SELECT id, firstName, lastName
       FROM patients
       WHERE lower(lastName) LIKE ? AND lower(firstName) LIKE ?
       ORDER BY createdAt ASC
       LIMIT 1`
    ).get('%bounouala%', '%mohamed%');

    if (targetPatient?.id) {
      const demoImagePath = path.resolve(process.cwd(), 'assets', 'logo.png');
      const imageFamilies = ['Radiographie', 'IRM', 'Scanner CT'];
      const checkAttachment = db.prepare(
        'SELECT id FROM patient_attachments WHERE patientId = ? AND examFamily = ? AND sourceType = ? LIMIT 1'
      );
      const insertAttachment = db.prepare(`
        INSERT INTO patient_attachments
          (id, patientId, consultationId, fileName, filePath, mimeType, fileSize, examFamily, sourceType, sourceLabel, notes, createdAt, updatedAt)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      for (const family of imageFamilies) {
        const exists = checkAttachment.get(targetPatient.id, family, 'seed-demo');
        if (exists) continue;

        const fileName = `${family.replace(/\s+/g, '_').toLowerCase()}_demo_${targetPatient.id.slice(0, 8)}.png`;
        insertAttachment.run(
          uuidv4(),
          targetPatient.id,
          fileName,
          demoImagePath,
          'image/png',
          0,
          family,
          'seed-demo',
          'Exemple généré automatiquement',
          `${family} exemple (démo)`
        );
      }
    }
  } catch (err) {
    console.log(`⚠️ Imaging demo seed error: ${err.message}`);
  }

  console.log('🎉 Test data seeding complete!');
  return {
    success: true,
    patients: patientIds.length,
    kines: kineIds.length,
    appointments: appointmentsCount
  };
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
    db.close();
    db = null;
    console.log('✅ Base de données fermée');
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
        key: 'MEDPRO-TRIAL-5JOURS',
        clientName: 'Licence Essai 5 Jours',
        expirationDate: null
      },
      {
        key: TRIAL_LICENSE_KEY,
        clientName: 'Licence Essai 7 Jours',
        expirationDate: null
      },
      {
        key: 'MEDPRO-TRIAL-15JOURS',
        clientName: 'Licence Essai 15 Jours',
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
  if (!db) {
    throw new Error('Base de données SQLite non initialisée');
  }
  const statement = db.prepare(sql);
  return statement.all(...params);
}

/**
 * Exécute une requête INSERT, UPDATE, DELETE
 */
export function run(sql, params = []) {
  if (!db) {
    throw new Error('Base de données SQLite non initialisée');
  }
  const statement = db.prepare(sql);
  return statement.run(...params);
}

/**
 * Exécute une requête et retourne le premier résultat
 */
export function queryOne(sql, params = []) {
  if (!db) {
    throw new Error('Base de données SQLite non initialisée');
  }
  const statement = db.prepare(sql);
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
