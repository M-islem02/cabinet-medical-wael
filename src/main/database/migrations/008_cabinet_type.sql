ALTER TABLE package_config
  ADD COLUMN IF NOT EXISTS cabinetType VARCHAR(20);

UPDATE package_config
SET cabinetType = CASE
  WHEN COALESCE(maxDoctors, 1) > 1 THEN 'multiple'
  ELSE 'single'
END
WHERE cabinetType IS NULL OR cabinetType = '';
