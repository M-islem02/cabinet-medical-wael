-- Assign appointments to the selected practitioner. Legacy appointments keep
-- a null value and continue to use their patient relationship as fallback.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS assignedTo VARCHAR(36);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_assignedto_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_assignedto_fkey
      FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_assigned_time
  ON appointments (assignedTo, appointmentDateTime);

-- Preserve the historical primary-doctor ownership when it is available.
UPDATE appointments a
SET assignedTo = p.primaryDoctorId
FROM patients p
WHERE a.patientId = p.id
  AND a.assignedTo IS NULL
  AND p.primaryDoctorId IS NOT NULL;
