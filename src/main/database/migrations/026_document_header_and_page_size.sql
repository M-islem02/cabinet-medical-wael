-- Document header scales, default page size, font family and custom title
ALTER TABLE settings ADD COLUMN IF NOT EXISTS defaultDocumentPageSize VARCHAR(10) DEFAULT 'A5';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentFontFamily VARCHAR(50) DEFAULT 'segoe';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentBonPourTitle VARCHAR(100) DEFAULT 'Demande de Bilan';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentDoctorNameScale INTEGER DEFAULT 120;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentSpecialtyScale INTEGER DEFAULT 100;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS documentMetaScale INTEGER DEFAULT 100;
