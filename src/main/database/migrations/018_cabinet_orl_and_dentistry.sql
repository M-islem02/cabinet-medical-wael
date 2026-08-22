-- Migration 018: Support Comptes Séparés par Spécialité (ORL & Dentisterie)
ALTER TABLE package_config
  ADD COLUMN IF NOT EXISTS featureDentistry BOOLEAN DEFAULT TRUE;

UPDATE package_config
SET enabledSpecialties = '["orl", "dentistry"]',
    featureORL = TRUE,
    featureDentistry = TRUE,
    maxDoctors = GREATEST(COALESCE(maxDoctors, 1), 10),
    maxAssistants = GREATEST(COALESCE(maxAssistants, 1), 5),
    cabinetType = 'multiple'
WHERE id IS NOT NULL;

-- 1. Médecin Praticien ORL
INSERT INTO users (id, username, password, fullName, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt)
VALUES (
  'user-dr-orl-001',
  'dr.orl',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'Dr. Médecin ORL',
  'doctor',
  'orl',
  FALSE,
  FALSE,
  TRUE,
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  fullName = 'Dr. Médecin ORL',
  role = 'doctor',
  specialty = 'orl',
  isActive = TRUE;

-- 2. Directeur Spécialiste ORL
INSERT INTO users (id, username, password, fullName, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt)
VALUES (
  'user-dir-orl-001',
  'dir.orl',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'Directeur Cabinet ORL',
  'director',
  'orl',
  TRUE,
  FALSE,
  TRUE,
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  fullName = 'Directeur Cabinet ORL',
  role = 'director',
  specialty = 'orl',
  isAdmin = TRUE,
  isActive = TRUE;

-- 3. Médecin Praticien Dentiste
INSERT INTO users (id, username, password, fullName, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt)
VALUES (
  'user-dr-dentiste-001',
  'dr.dentiste',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'Dr. Chirurgien Dentiste',
  'dentist',
  'dentistry',
  FALSE,
  FALSE,
  TRUE,
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  fullName = 'Dr. Chirurgien Dentiste',
  role = 'dentist',
  specialty = 'dentistry',
  isActive = TRUE;

-- 4. Directeur Spécialiste Dentiste
INSERT INTO users (id, username, password, fullName, role, specialty, isAdmin, isSuperAdmin, isActive, createdAt)
VALUES (
  'user-dir-dentiste-001',
  'dir.dentiste',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'Directeur Cabinet Dentaire',
  'director',
  'dentistry',
  TRUE,
  FALSE,
  TRUE,
  NOW()
)
ON CONFLICT (username) DO UPDATE SET
  fullName = 'Directeur Cabinet Dentaire',
  role = 'director',
  specialty = 'dentistry',
  isAdmin = TRUE,
  isActive = TRUE;
