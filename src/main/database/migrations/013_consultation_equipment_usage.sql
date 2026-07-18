CREATE TABLE IF NOT EXISTS consultation_equipment_usage (
    id VARCHAR(36) PRIMARY KEY,
    consultationId VARCHAR(36) NOT NULL,
    equipmentId VARCHAR(36) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consultation_equipment_consultation FOREIGN KEY (consultationId)
        REFERENCES consultations(id) ON DELETE CASCADE,
    CONSTRAINT fk_consultation_equipment_equipment FOREIGN KEY (equipmentId)
        REFERENCES equipment(id) ON DELETE CASCADE,
    CONSTRAINT uq_consultation_equipment UNIQUE (consultationId, equipmentId)
);

CREATE INDEX IF NOT EXISTS idx_consultation_equipment_consultation
    ON consultation_equipment_usage(consultationId);
CREATE INDEX IF NOT EXISTS idx_consultation_equipment_equipment
    ON consultation_equipment_usage(equipmentId);
