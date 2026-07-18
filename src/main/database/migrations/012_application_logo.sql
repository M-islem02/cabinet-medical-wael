-- Store interface branding separately from logos used in printed documents.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS appLogoDataUrl TEXT;
