-- Historique de paiement par médecin : rattache chaque encaissement à son praticien
ALTER TABLE payments ADD COLUMN IF NOT EXISTS practitionerId VARCHAR(36);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS practitionerName VARCHAR(160);
CREATE INDEX IF NOT EXISTS idx_payments_practitioner ON payments(practitionerId);
