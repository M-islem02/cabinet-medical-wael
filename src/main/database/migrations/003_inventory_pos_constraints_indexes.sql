-- Constraints and query-driven indexes for inventory, POS, and equipment.
-- Foreign keys on pre-existing tables are staged with NOT VALID, then
-- validated without deleting or rewriting client data.

DO $$
DECLARE bad_ids TEXT;
BEGIN
    SELECT string_agg(id, ', ') INTO bad_ids
    FROM (
        SELECT i.id::text AS id
        FROM inventory i
        LEFT JOIN suppliers s ON s.id = i.supplierId
        WHERE i.supplierId IS NOT NULL AND s.id IS NULL
        ORDER BY i.id
        LIMIT 10
    ) violations;
    IF bad_ids IS NOT NULL THEN
        RAISE EXCEPTION 'fk_inventory_supplier blocked; inventory rows reference missing suppliers (first IDs: %)', bad_ids;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_supplier') THEN
        ALTER TABLE inventory ADD CONSTRAINT fk_inventory_supplier
            FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL NOT VALID;
    END IF;
    ALTER TABLE inventory VALIDATE CONSTRAINT fk_inventory_supplier;
END $$;

DO $$
DECLARE bad_ids TEXT;
BEGIN
    SELECT string_agg(id, ', ') INTO bad_ids
    FROM (
        SELECT m.id::text AS id
        FROM inventory_movements m
        LEFT JOIN inventory_lots l ON l.id = m.lotId
        WHERE m.lotId IS NOT NULL AND l.id IS NULL
        ORDER BY m.id
        LIMIT 10
    ) violations;
    IF bad_ids IS NOT NULL THEN
        RAISE EXCEPTION 'fk_inventory_movements_lot blocked; violating movement IDs: %', bad_ids;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_movements_lot') THEN
        ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_lot
            FOREIGN KEY (lotId) REFERENCES inventory_lots(id) ON DELETE SET NULL NOT VALID;
    END IF;
    ALTER TABLE inventory_movements VALIDATE CONSTRAINT fk_inventory_movements_lot;
END $$;

DO $$
DECLARE bad_ids TEXT;
BEGIN
    SELECT string_agg(id, ', ') INTO bad_ids
    FROM (
        SELECT m.id::text AS id
        FROM inventory_movements m
        LEFT JOIN pos_sales s ON s.id = m.posSaleId
        WHERE m.posSaleId IS NOT NULL AND s.id IS NULL
        ORDER BY m.id
        LIMIT 10
    ) violations;
    IF bad_ids IS NOT NULL THEN
        RAISE EXCEPTION 'fk_inventory_movements_pos_sale blocked; violating movement IDs: %', bad_ids;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_movements_pos_sale') THEN
        ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_pos_sale
            FOREIGN KEY (posSaleId) REFERENCES pos_sales(id) ON DELETE SET NULL NOT VALID;
    END IF;
    ALTER TABLE inventory_movements VALIDATE CONSTRAINT fk_inventory_movements_pos_sale;
END $$;

DO $$
DECLARE bad_ids TEXT;
BEGIN
    SELECT string_agg(id, ', ') INTO bad_ids
    FROM (
        SELECT m.id::text AS id
        FROM inventory_movements m
        LEFT JOIN purchase_orders p ON p.id = m.purchaseOrderId
        WHERE m.purchaseOrderId IS NOT NULL AND p.id IS NULL
        ORDER BY m.id
        LIMIT 10
    ) violations;
    IF bad_ids IS NOT NULL THEN
        RAISE EXCEPTION 'fk_inventory_movements_purchase_order blocked; violating movement IDs: %', bad_ids;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inventory_movements_purchase_order') THEN
        ALTER TABLE inventory_movements ADD CONSTRAINT fk_inventory_movements_purchase_order
            FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE SET NULL NOT VALID;
    END IF;
    ALTER TABLE inventory_movements VALIDATE CONSTRAINT fk_inventory_movements_purchase_order;
END $$;

DO $$
DECLARE bad_ids TEXT;
BEGIN
    SELECT string_agg(id, ', ') INTO bad_ids
    FROM (
        SELECT p.id::text AS id
        FROM plan_equipment_usage p
        LEFT JOIN equipment e ON e.id = p.equipmentId
        WHERE p.equipmentId IS NOT NULL AND e.id IS NULL
        ORDER BY p.id
        LIMIT 10
    ) violations;
    IF bad_ids IS NOT NULL THEN
        RAISE EXCEPTION 'fk_plan_equipment_usage_equipment blocked; violating usage IDs: %', bad_ids;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_equipment_usage_equipment') THEN
        ALTER TABLE plan_equipment_usage ADD CONSTRAINT fk_plan_equipment_usage_equipment
            FOREIGN KEY (equipmentId) REFERENCES equipment(id) ON DELETE SET NULL NOT VALID;
    END IF;
    ALTER TABLE plan_equipment_usage VALIDATE CONSTRAINT fk_plan_equipment_usage_equipment;
END $$;

DO $$
DECLARE bad_ids TEXT;
BEGIN
    SELECT string_agg(id, ', ') INTO bad_ids
    FROM (
        SELECT id::text AS id
        FROM plan_equipment_usage
        WHERE inventoryId IS NULL AND equipmentId IS NULL
        ORDER BY id
        LIMIT 10
    ) violations;
    IF bad_ids IS NOT NULL THEN
        RAISE EXCEPTION 'ck_plan_equipment_usage_resource blocked; rows have neither inventory nor equipment (first IDs: %)', bad_ids;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_plan_equipment_usage_resource') THEN
        ALTER TABLE plan_equipment_usage ADD CONSTRAINT ck_plan_equipment_usage_resource
            CHECK (inventoryId IS NOT NULL OR equipmentId IS NOT NULL) NOT VALID;
    END IF;
    ALTER TABLE plan_equipment_usage VALIDATE CONSTRAINT ck_plan_equipment_usage_resource;
END $$;

DO $$
DECLARE duplicate_keys TEXT;
BEGIN
    SELECT string_agg(scope, '; ') INTO duplicate_keys
    FROM (
        SELECT actType || '/' || inventoryId || '/' || specialty AS scope
        FROM act_consumables
        GROUP BY actType, inventoryId, specialty
        HAVING COUNT(*) > 1
        ORDER BY scope
        LIMIT 10
    ) duplicates;
    IF duplicate_keys IS NOT NULL THEN
        RAISE EXCEPTION 'uq_act_consumables_scope blocked; duplicate scopes: %', duplicate_keys;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_act_consumables_scope') THEN
        ALTER TABLE act_consumables ADD CONSTRAINT uq_act_consumables_scope
            UNIQUE (actType, inventoryId, specialty);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(isActive);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_specialty ON suppliers(specialty);

CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplierId);
CREATE INDEX IF NOT EXISTS idx_inventory_active ON inventory(isActive);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_inventory ON inventory_lots(inventoryId);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_supplier ON inventory_lots(supplierId);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiration ON inventory_lots(expirationDate);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_fefo
    ON inventory_lots(inventoryId, isActive, remainingQuantity, expirationDate);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplierId);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(orderDate);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expected_delivery ON purchase_orders(expectedDeliveryDate);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchaseOrderId);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_inventory ON purchase_order_items(inventoryId);

CREATE INDEX IF NOT EXISTS idx_pos_sales_patient ON pos_sales(patientId);
CREATE INDEX IF NOT EXISTS idx_pos_sales_payment ON pos_sales(paymentId);
CREATE INDEX IF NOT EXISTS idx_pos_sales_creator ON pos_sales(createdBy);
CREATE INDEX IF NOT EXISTS idx_pos_sales_sale_date ON pos_sales(saleDate);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(posSaleId);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_inventory ON pos_sale_items(inventoryId);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_lot ON pos_sale_items(lotId);

CREATE INDEX IF NOT EXISTS idx_act_consumables_act ON act_consumables(actType);
CREATE INDEX IF NOT EXISTS idx_act_consumables_specialty ON act_consumables(specialty);
CREATE INDEX IF NOT EXISTS idx_act_consumables_inventory ON act_consumables(inventoryId);

CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_doctor ON equipment(assignedDoctorId);
CREATE INDEX IF NOT EXISTS idx_equipment_next_maintenance ON equipment(nextMaintenanceDate);
CREATE INDEX IF NOT EXISTS idx_equipment_active ON equipment(isActive);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_equipment ON equipment_maintenance(equipmentId);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_supplier ON equipment_maintenance(supplierId);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_date ON equipment_maintenance(maintenanceDate);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_performed_by ON equipment_maintenance(performedBy);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot ON inventory_movements(lotId);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_pos_sale ON inventory_movements(posSaleId);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_purchase_order ON inventory_movements(purchaseOrderId);

CREATE INDEX IF NOT EXISTS idx_plan_equipment_usage_equipment ON plan_equipment_usage(equipmentId);
