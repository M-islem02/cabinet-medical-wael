ALTER TABLE sick_leaves
  ADD COLUMN IF NOT EXISTS documentKind VARCHAR(20) DEFAULT 'certificate';
