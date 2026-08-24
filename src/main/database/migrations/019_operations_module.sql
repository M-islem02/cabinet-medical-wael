-- ============================================================================
-- Migration 019: Generic Transversal Operations / Interventions Module
-- Compatible with all specialties: ORL, Dentistry, General Surgery, etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS operations (
    id VARCHAR(36) PRIMARY KEY,
    patientId VARCHAR(36) NOT NULL,
    operationDate DATE NOT NULL,
    operationTime VARCHAR(10),
    operationType VARCHAR(150) NOT NULL,
    operationCode VARCHAR(50),
    category VARCHAR(50) NOT NULL DEFAULT 'orl',
    practitionerId VARCHAR(36),
    practitionerName VARCHAR(100),
    room VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    anesthesiaType VARCHAR(50) DEFAULT 'Locale',
    durationMinutes INTEGER DEFAULT 30,
    clinicalNotes TEXT,
    postOpInstructions TEXT,
    equipmentUsed TEXT,
    consumablesUsed TEXT,
    cost NUMERIC(10,2) DEFAULT 0,
    paymentId VARCHAR(36),
    paymentStatus VARCHAR(30) DEFAULT 'unpaid',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_operations_patient FOREIGN KEY (patientId)
        REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operations_patient ON operations(patientId);
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(operationDate);
CREATE INDEX IF NOT EXISTS idx_operations_practitioner ON operations(practitionerId);
CREATE INDEX IF NOT EXISTS idx_operations_category ON operations(category);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);

CREATE TABLE IF NOT EXISTS operation_types_catalog (
    id VARCHAR(36) PRIMARY KEY,
    specialty VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    category VARCHAR(50) DEFAULT 'Chirurgie',
    defaultCost NUMERIC(10,2) DEFAULT 0,
    defaultDuration INTEGER DEFAULT 30,
    defaultEquipment TEXT,
    defaultConsumables TEXT,
    description TEXT,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    isCustom BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_op_catalog_specialty ON operation_types_catalog(specialty);

-- Initial catalog seed for ORL and General Surgery
INSERT INTO operation_types_catalog (id, specialty, name, code, defaultCost, defaultDuration, description, isActive, isCustom)
VALUES
    -- ORL
    ('op_orl_1', 'orl', 'Myringotomie & Aérateurs transtympaniques (Diabolos)', 'ORL-ACT-01', 15000.00, 30, 'Incision tympanique et mise en place d''aérateurs transtympaniques (T-tubes / Diabolos)', TRUE, FALSE),
    ('op_orl_2', 'orl', 'Amygdalectomie (Tonsillectomie)', 'ORL-ACT-02', 35000.00, 45, 'Exérèse chirurgicale des amygdales palatines', TRUE, FALSE),
    ('op_orl_3', 'orl', 'Adénoïdectomie (Végétations)', 'ORL-ACT-03', 25000.00, 30, 'Curetage des végétations adénoïdes', TRUE, FALSE),
    ('op_orl_4', 'orl', 'Polypectomie nasale sous endoscopie', 'ORL-ACT-04', 30000.00, 45, 'Exérèse de polypes des fosses nasales sous contrôle vidéo-endoscopique', TRUE, FALSE),
    ('op_orl_5', 'orl', 'Septoplastie (Déviation de la cloison)', 'ORL-ACT-05', 45000.00, 60, 'Chirurgie correctrice de la cloison nasale', TRUE, FALSE),
    ('op_orl_6', 'orl', 'Paracentèse tympanique', 'ORL-ACT-06', 8000.00, 15, 'Ponction évacuatrice de la membrane tympanique', TRUE, FALSE),
    ('op_orl_7', 'orl', 'Turbinoplastie / Cautérisation des cornets', 'ORL-ACT-07', 18000.00, 30, 'Réduction volumétrique des cornets inférieurs par radiofréquence ou cautérisation', TRUE, FALSE),
    ('op_orl_8', 'orl', 'Réduction de fracture des os propres du nez (OPN)', 'ORL-ACT-08', 20000.00, 30, 'Réduction orthopédique et contention de fracture nasale récente', TRUE, FALSE),
    ('op_orl_9', 'orl', 'Biopsie ORL (Cavum, Larynx, Fosse nasale)', 'ORL-ACT-09', 12000.00, 20, 'Prélèvement biopsique à visée anatomopathologique', TRUE, FALSE),
    ('op_orl_10', 'orl', 'Freinectomie linguale ou labiale', 'ORL-ACT-10', 10000.00, 20, 'Section du frein de langue ou de lèvre', TRUE, FALSE),

    -- Actes Chirurgicaux Généraux
    ('op_gen_1', 'general', 'Exérèse de kyste / lipome sous anesthésie locale', 'GEN-ACT-01', 12000.00, 30, 'Exérèse chirurgicale complète avec fermeture par suture', TRUE, FALSE),
    ('op_gen_2', 'general', 'Suture de plaie complexe / Parage', 'GEN-ACT-02', 8000.00, 30, 'Nettoyage, désinfection et suture plan par plan', TRUE, FALSE),
    ('op_gen_3', 'general', 'Drainage d''abcès ou hématome', 'GEN-ACT-03', 7000.00, 20, 'Incision, évacuation, drainage et méchage', TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;
