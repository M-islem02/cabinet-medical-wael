ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS documentShowBarcode BOOLEAN DEFAULT TRUE;

UPDATE settings
SET documentShowBarcode = TRUE
WHERE documentShowBarcode IS NULL;
