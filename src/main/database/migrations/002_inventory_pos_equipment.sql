-- Inventory, supplier, purchase-order, POS, and physical equipment schema.
-- All identifiers intentionally remain unquoted for compatibility with the
-- application's existing unquoted camelCase SQL.

CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contactName VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    specialty VARCHAR(100),
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS supplierId VARCHAR(36);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS photoPath TEXT;

CREATE TABLE IF NOT EXISTS inventory_lots (
    id VARCHAR(36) PRIMARY KEY,
    inventoryId VARCHAR(36) NOT NULL,
    supplierId VARCHAR(36),
    lotNumber VARCHAR(255),
    purchaseDate DATE,
    expirationDate DATE,
    initialQuantity INTEGER NOT NULL,
    remainingQuantity INTEGER NOT NULL,
    unitPrice NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_inventory_lots_initial_quantity CHECK (initialQuantity >= 0),
    CONSTRAINT ck_inventory_lots_remaining_quantity CHECK (remainingQuantity >= 0),
    CONSTRAINT ck_inventory_lots_quantity_bounds CHECK (remainingQuantity <= initialQuantity),
    CONSTRAINT ck_inventory_lots_unit_price CHECK (unitPrice >= 0),
    CONSTRAINT fk_inventory_lots_inventory FOREIGN KEY (inventoryId)
        REFERENCES inventory(id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_lots_supplier FOREIGN KEY (supplierId)
        REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id VARCHAR(36) PRIMARY KEY,
    supplierId VARCHAR(36),
    orderDate DATE NOT NULL DEFAULT CURRENT_DATE,
    expectedDeliveryDate DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    totalAmount NUMERIC(12,2) NOT NULL DEFAULT 0,
    invoiceNumber VARCHAR(255),
    invoiceAmount NUMERIC(12,2),
    notes TEXT,
    createdBy VARCHAR(36),
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_purchase_orders_total_amount CHECK (totalAmount >= 0),
    CONSTRAINT ck_purchase_orders_invoice_amount CHECK (invoiceAmount IS NULL OR invoiceAmount >= 0),
    CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplierId)
        REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_purchase_orders_created_by FOREIGN KEY (createdBy)
        REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id VARCHAR(36) PRIMARY KEY,
    purchaseOrderId VARCHAR(36) NOT NULL,
    inventoryId VARCHAR(36) NOT NULL,
    orderedQuantity INTEGER NOT NULL,
    receivedQuantity INTEGER NOT NULL DEFAULT 0,
    unitPrice NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    CONSTRAINT ck_purchase_order_items_ordered_quantity CHECK (orderedQuantity > 0),
    CONSTRAINT ck_purchase_order_items_received_quantity CHECK (receivedQuantity >= 0),
    CONSTRAINT ck_purchase_order_items_received_bounds CHECK (receivedQuantity <= orderedQuantity),
    CONSTRAINT ck_purchase_order_items_unit_price CHECK (unitPrice >= 0),
    CONSTRAINT fk_purchase_order_items_order FOREIGN KEY (purchaseOrderId)
        REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_order_items_inventory FOREIGN KEY (inventoryId)
        REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pos_sales (
    id VARCHAR(36) PRIMARY KEY,
    patientId VARCHAR(36),
    customerName VARCHAR(255),
    saleDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    totalAmount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discountAmount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discountPercent NUMERIC(5,2) NOT NULL DEFAULT 0,
    finalAmount NUMERIC(12,2) NOT NULL DEFAULT 0,
    paymentMethod VARCHAR(50),
    paymentId VARCHAR(36),
    notes TEXT,
    createdBy VARCHAR(36),
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_pos_sales_total_amount CHECK (totalAmount >= 0),
    CONSTRAINT ck_pos_sales_discount_amount CHECK (discountAmount >= 0),
    CONSTRAINT ck_pos_sales_discount_percent CHECK (discountPercent >= 0 AND discountPercent <= 100),
    CONSTRAINT ck_pos_sales_final_amount CHECK (finalAmount >= 0),
    CONSTRAINT fk_pos_sales_patient FOREIGN KEY (patientId)
        REFERENCES patients(id) ON DELETE SET NULL,
    CONSTRAINT fk_pos_sales_payment FOREIGN KEY (paymentId)
        REFERENCES payments(id) ON DELETE SET NULL,
    CONSTRAINT fk_pos_sales_created_by FOREIGN KEY (createdBy)
        REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
    id VARCHAR(36) PRIMARY KEY,
    posSaleId VARCHAR(36) NOT NULL,
    inventoryId VARCHAR(36) NOT NULL,
    lotId VARCHAR(36),
    quantity INTEGER NOT NULL,
    unitPrice NUMERIC(12,2) NOT NULL DEFAULT 0,
    purchasePrice NUMERIC(12,2) NOT NULL DEFAULT 0,
    totalPrice NUMERIC(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT ck_pos_sale_items_quantity CHECK (quantity > 0),
    CONSTRAINT ck_pos_sale_items_unit_price CHECK (unitPrice >= 0),
    CONSTRAINT ck_pos_sale_items_purchase_price CHECK (purchasePrice >= 0),
    CONSTRAINT ck_pos_sale_items_total_price CHECK (totalPrice >= 0),
    CONSTRAINT fk_pos_sale_items_sale FOREIGN KEY (posSaleId)
        REFERENCES pos_sales(id) ON DELETE CASCADE,
    CONSTRAINT fk_pos_sale_items_inventory FOREIGN KEY (inventoryId)
        REFERENCES inventory(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pos_sale_items_lot FOREIGN KEY (lotId)
        REFERENCES inventory_lots(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS act_consumables (
    id VARCHAR(36) PRIMARY KEY,
    actType VARCHAR(100) NOT NULL,
    inventoryId VARCHAR(36) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
    specialty VARCHAR(100) NOT NULL DEFAULT 'dentistry',
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_act_consumables_quantity CHECK (quantity > 0),
    CONSTRAINT uq_act_consumables_scope UNIQUE (actType, inventoryId, specialty),
    CONSTRAINT fk_act_consumables_inventory FOREIGN KEY (inventoryId)
        REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equipment (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    brand VARCHAR(255),
    model VARCHAR(255),
    serialNumber VARCHAR(255),
    purchaseDate DATE,
    warrantyEnd DATE,
    assignedRoom VARCHAR(255),
    assignedDoctorId VARCHAR(36),
    status VARCHAR(50) NOT NULL DEFAULT 'available',
    lastMaintenanceDate DATE,
    nextMaintenanceDate DATE,
    notes TEXT,
    specificFields JSONB NOT NULL DEFAULT '{}'::jsonb,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_equipment_assigned_doctor FOREIGN KEY (assignedDoctorId)
        REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS equipment_maintenance (
    id VARCHAR(36) PRIMARY KEY,
    equipmentId VARCHAR(36) NOT NULL,
    maintenanceDate DATE NOT NULL,
    maintenanceType VARCHAR(100) NOT NULL,
    cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    technician VARCHAR(255),
    supplierId VARCHAR(36),
    notes TEXT,
    performedBy VARCHAR(36),
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_equipment_maintenance_cost CHECK (cost >= 0),
    CONSTRAINT fk_equipment_maintenance_equipment FOREIGN KEY (equipmentId)
        REFERENCES equipment(id) ON DELETE CASCADE,
    CONSTRAINT fk_equipment_maintenance_supplier FOREIGN KEY (supplierId)
        REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_equipment_maintenance_performed_by FOREIGN KEY (performedBy)
        REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS lotId VARCHAR(36);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS posSaleId VARCHAR(36);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS purchaseOrderId VARCHAR(36);

ALTER TABLE plan_equipment_usage ADD COLUMN IF NOT EXISTS equipmentId VARCHAR(36);
ALTER TABLE plan_equipment_usage ALTER COLUMN inventoryId DROP NOT NULL;

