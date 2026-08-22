-- Migration 017: Spécialité ORL (Oto-Rhino-Laryngologie)
ALTER TABLE package_config
  ADD COLUMN IF NOT EXISTS featureORL BOOLEAN DEFAULT TRUE;

ALTER TABLE package_config
  ADD COLUMN IF NOT EXISTS priceORL NUMERIC(10,2) DEFAULT 0;

UPDATE package_config
SET activeSpecialty = 'orl',
    enabledSpecialties = '["orl"]',
    featureORL = TRUE,
    featureDentistry = FALSE,
    featureRehabilitation = FALSE,
    featureKineStaff = FALSE,
    featureCardiology = FALSE
WHERE activeSpecialty IN ('dentistry', 'mpr', 'cardiology') OR activeSpecialty IS NULL;

UPDATE users
SET specialty = 'orl'
WHERE role IN ('doctor', 'dentist') AND (specialty IN ('dentistry', 'dentist', 'mpr', 'cardiology') OR specialty IS NULL OR specialty = '');
