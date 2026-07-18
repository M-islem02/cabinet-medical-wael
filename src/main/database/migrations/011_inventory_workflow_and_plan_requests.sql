-- Clarify optional lot tracking, editable POS sales, and session-bound payment requests.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS isPerishable BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE inventory i
SET isPerishable = TRUE
WHERE i.expirationDate IS NOT NULL
   OR EXISTS (
       SELECT 1 FROM inventory_lots l
       WHERE l.inventoryId = i.id AND l.expirationDate IS NOT NULL
   );

ALTER TABLE plan_payment_sessions ADD COLUMN IF NOT EXISTS paymentRequestId VARCHAR(36);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_session_payment_request') THEN
        ALTER TABLE plan_payment_sessions ADD CONSTRAINT fk_plan_session_payment_request
            FOREIGN KEY (paymentRequestId) REFERENCES user_notifications(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS invoiceNumber VARCHAR(80);
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS invoicedAt TIMESTAMP;
ALTER TABLE pos_sales ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS ck_pos_sales_status;
ALTER TABLE pos_sales ADD CONSTRAINT ck_pos_sales_status
    CHECK (status IN ('open', 'completed', 'returned'));

CREATE INDEX IF NOT EXISTS idx_plan_sessions_payment_request ON plan_payment_sessions(paymentRequestId);
CREATE INDEX IF NOT EXISTS idx_inventory_perishable ON inventory(isPerishable);
