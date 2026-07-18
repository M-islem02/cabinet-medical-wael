-- Full POS returns: preserve the original sale for audit while tracking who
-- returned it and why. Stock restoration is handled transactionally by IPC.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS returnedAt TIMESTAMP;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS returnedBy VARCHAR(36);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS returnReason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pos_sales_status') THEN
        ALTER TABLE pos_sales ADD CONSTRAINT ck_pos_sales_status
            CHECK (status IN ('completed', 'returned'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pos_sales_returned_by') THEN
        ALTER TABLE pos_sales ADD CONSTRAINT fk_pos_sales_returned_by
            FOREIGN KEY (returnedBy) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_sales_status ON pos_sales(status);
