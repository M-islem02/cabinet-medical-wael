-- Migration 028: Traumatologie & Chirurgie Orthopédique Schema

CREATE TABLE IF NOT EXISTS traumato_records (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL UNIQUE,
  generalNotes TEXT,
  allergies TEXT,
  bloodType VARCHAR(10),
  mechanism TEXT,
  accidentDate TIMESTAMP,
  evaScore INTEGER DEFAULT 0,
  cauchoixStage VARCHAR(10),
  neuroVascularExam TEXT,
  compartmentSyndromeNotes TEXT,
  lastVisitDate DATE,
  nextVisitDate DATE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traumato_lesions (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  boneCode VARCHAR(50) NOT NULL,
  boneName VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'healthy',
  side VARCHAR(20) DEFAULT 'unilateral',
  fractureClassification VARCHAR(100),
  displacement VARCHAR(100),
  treatmentMode VARCHAR(50),
  notes TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (patientId, boneCode),
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traumato_lesions_history (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  boneCode VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'healthy',
  notes TEXT,
  recordedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traumato_treatments (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  boneCode VARCHAR(50),
  treatmentType VARCHAR(150) NOT NULL,
  description TEXT,
  cost NUMERIC(10,2) DEFAULT 0,
  paid NUMERIC(10,2) DEFAULT 0,
  isPaid BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'completed',
  treatmentDate DATE NOT NULL,
  nextFollowUp DATE,
  planId VARCHAR(36),
  doctorId VARCHAR(36),
  notes TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (cost >= 0),
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traumato_plans (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  bones TEXT,
  treatments TEXT,
  estimatedCost NUMERIC(10,2) DEFAULT 0,
  actualCost NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  priority VARCHAR(50) DEFAULT 'normal',
  startDate DATE,
  endDate DATE,
  notes TEXT,
  createdBy VARCHAR(36),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS traumato_imaging (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL,
  boneCode VARCHAR(50),
  imagingType VARCHAR(100),
  filePath TEXT,
  findings TEXT,
  notes TEXT,
  imagingDate DATE NOT NULL,
  createdBy VARCHAR(36),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(patientId) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_traumato_lesions_patient ON traumato_lesions(patientId);
CREATE INDEX IF NOT EXISTS idx_traumato_treatments_patient ON traumato_treatments(patientId);
CREATE INDEX IF NOT EXISTS idx_traumato_plans_patient ON traumato_plans(patientId);
CREATE INDEX IF NOT EXISTS idx_traumato_imaging_patient ON traumato_imaging(patientId);
