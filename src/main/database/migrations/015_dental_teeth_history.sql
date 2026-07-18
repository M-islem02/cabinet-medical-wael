CREATE TABLE IF NOT EXISTS dental_teeth_history (
  id VARCHAR(36) PRIMARY KEY,
  patientId VARCHAR(36) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  toothNumber INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'healthy',
  surfaces TEXT,
  notes TEXT,
  recordedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dental_teeth_history_patient_date
  ON dental_teeth_history(patientId, recordedAt DESC);

CREATE INDEX IF NOT EXISTS idx_dental_teeth_history_patient_tooth_date
  ON dental_teeth_history(patientId, toothNumber, recordedAt DESC);

INSERT INTO dental_teeth_history (id, patientId, toothNumber, status, surfaces, notes, recordedAt)
SELECT id, patientId, toothNumber, COALESCE(status, 'healthy'), surfaces, notes,
       COALESCE(updatedAt, CURRENT_TIMESTAMP)
FROM dental_teeth
ON CONFLICT (id) DO NOTHING;
