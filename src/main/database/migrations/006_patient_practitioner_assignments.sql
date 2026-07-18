-- A patient can be followed by several practitioners without duplicating the
-- shared identity record. Clinical access is granted through this table.
CREATE TABLE IF NOT EXISTS patient_practitioners (
  patientId VARCHAR(36) NOT NULL,
  practitionerId VARCHAR(36) NOT NULL,
  assignedByUserId VARCHAR(36),
  assignedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (patientId, practitionerId),
  FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (practitionerId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignedByUserId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_practitioners_practitioner
  ON patient_practitioners (practitionerId, patientId);

-- Preserve every historical primary-doctor relationship.
INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId, assignedAt)
SELECT p.id, p.primaryDoctorId, p.createdByUserId, COALESCE(p.createdAt, CURRENT_TIMESTAMP)
FROM patients p
JOIN users u ON u.id = p.primaryDoctorId
WHERE p.primaryDoctorId IS NOT NULL
  AND u.role IN ('doctor', 'dentist')
  AND COALESCE(u.isSuperAdmin, FALSE) = FALSE
ON CONFLICT (patientId, practitionerId) DO NOTHING;
