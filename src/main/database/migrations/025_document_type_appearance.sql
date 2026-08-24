-- Per-document-type appearance settings
-- documentFormats: A4/A5 page size per document type
-- documentTextScales: text size percentage per document type
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentFormats TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentTextScales TEXT;
