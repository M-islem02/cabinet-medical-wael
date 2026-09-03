/**
 * Gestionnaire IPC — Module Opérations & Interventions Chirurgicales
 * Module transversal et réutilisable pour toutes spécialités (ORL, Dentisterie, etc.)
 */

import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const nowSql = () => moment().format('YYYY-MM-DD HH:mm:ss');

function getOperationContext() {
  const role = String(global.currentUser?.role || '').trim();
  return {
    userId: global.currentUser?.id || null,
    userName: global.currentUser ? `${global.currentUser.firstName || ''} ${global.currentUser.lastName || ''}`.trim() || global.currentUser.username : 'Praticien',
    role,
    isSuperAdmin: !!global.currentUser?.isSuperAdmin,
    isAdmin: !!global.currentUser?.isAdmin,
    isDoctor: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant',
    canManage: !!global.currentUser?.isSuperAdmin || !!global.currentUser?.isAdmin || role === 'doctor' || role === 'dentist'
  };
}

let tablesEnsured = false;
async function ensureOperationsTables() {
  if (tablesEnsured) return;
  try {
    await run(`
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
        paidAmount NUMERIC(10,2) DEFAULT 0,
        paymentId VARCHAR(36),
        paymentStatus VARCHAR(30) DEFAULT 'unpaid',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS operation_types_catalog (
        id VARCHAR(36) PRIMARY KEY,
        specialty VARCHAR(50) NOT NULL DEFAULT 'orl',
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
      )
    `);

    // Ensure all columns exist on existing databases
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Chirurgie'`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS specialty VARCHAR(50) DEFAULT 'orl'`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS code VARCHAR(50)`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS defaultCost NUMERIC(10,2) DEFAULT 0`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS defaultDuration INTEGER DEFAULT 30`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS defaultEquipment TEXT`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS defaultConsumables TEXT`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS description TEXT`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS isActive BOOLEAN DEFAULT TRUE`);
    await run(`ALTER TABLE operation_types_catalog ADD COLUMN IF NOT EXISTS isCustom BOOLEAN DEFAULT FALSE`);

    await run(`ALTER TABLE operations ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'orl'`);
    await run(`ALTER TABLE operations ADD COLUMN IF NOT EXISTS paidAmount NUMERIC(10,2) DEFAULT 0`);
    await run(`ALTER TABLE operations ADD COLUMN IF NOT EXISTS paymentStatus VARCHAR(30) DEFAULT 'unpaid'`);
    await run(`ALTER TABLE operations ADD COLUMN IF NOT EXISTS paymentId VARCHAR(36)`);
    tablesEnsured = true;
  } catch (e) {
    console.warn('ensureOperationsTables notice:', e.message);
  }
}

export function handleOperationEvents() {
  ensureOperationsTables().catch(() => {});

  // ── 1. CATALOGUE D'ACTES & TYPES D'OPÉRATIONS ─────────────────────────────
  ipcMain.handle('operation:getTypesCatalog', async (event, specialty = null) => {
    try {
      await ensureOperationsTables();
      let sql = `SELECT * FROM operation_types_catalog WHERE (isActive IS TRUE OR isActive = TRUE)`;
      const params = [];
      if (specialty) {
        sql += ` AND (specialty = ? OR specialty = 'general')`;
        params.push(specialty);
      }
      sql += ` ORDER BY name ASC`;
      const rows = await query(sql, params);
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error in operation:getTypesCatalog:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:saveTypeCatalog', async (event, data) => {
    try {
      await ensureOperationsTables();
      const ctx = getOperationContext();
      if (!ctx.canManage) return { success: false, error: 'Accès non autorisé' };
      const id = data.id || `op_custom_${Date.now()}`;
      const specialty = data.specialty || 'orl';
      const name = (data.name || '').trim();
      if (!name) return { success: false, error: 'Le nom de l\'acte est requis' };
      const code = toNull(data.code);
      const category = toNull(data.category || 'Chirurgie');
      const defaultCost = toNum(data.defaultCost);
      const defaultDuration = parseInt(data.defaultDuration, 10) || 30;
      const defaultEquipment = Array.isArray(data.defaultEquipment) ? JSON.stringify(data.defaultEquipment) : toNull(data.defaultEquipment);
      const defaultConsumables = Array.isArray(data.defaultConsumables) ? JSON.stringify(data.defaultConsumables) : toNull(data.defaultConsumables);
      const description = toNull(data.description);
      const isCustom = data.isCustom !== false;

      const existing = await queryOne(`SELECT id FROM operation_types_catalog WHERE id = ?`, [id]);
      if (existing) {
        await run(
          `UPDATE operation_types_catalog
           SET specialty = ?, name = ?, code = ?, category = ?, defaultCost = ?, defaultDuration = ?, defaultEquipment = ?, defaultConsumables = ?, description = ?
           WHERE id = ?`,
          [specialty, name, code, category, defaultCost, defaultDuration, defaultEquipment, defaultConsumables, description, id]
        );
      } else {
        await run(
          `INSERT INTO operation_types_catalog (id, specialty, name, code, category, defaultCost, defaultDuration, defaultEquipment, defaultConsumables, description, isActive, isCustom)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
          [id, specialty, name, code, category, defaultCost, defaultDuration, defaultEquipment, defaultConsumables, description, isCustom]
        );
      }
      return { success: true, data: { id, name, defaultCost } };
    } catch (error) {
      console.error('Error in operation:saveTypeCatalog:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:deleteTypeCatalog', async (event, id) => {
    try {
      const ctx = getOperationContext();
      if (!ctx.canManage) return { success: false, error: 'Accès non autorisé' };
      if (!id) return { success: false, error: 'ID requis' };
      await run(`DELETE FROM operation_types_catalog WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error('Error in operation:deleteTypeCatalog:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:checkStockAvailability', async (event, consumables = []) => {
    try {
      if (!Array.isArray(consumables) || consumables.length === 0) {
        return { success: true, isAvailable: true, missing: [] };
      }
      const missing = [];
      for (const item of consumables) {
        const invId = item.inventoryId || item.id;
        const requestedQty = toNum(item.quantity);
        if (invId && requestedQty > 0) {
          const row = await queryOne(`SELECT id, name, quantity FROM inventory WHERE id = ?`, [invId]);
          if (row) {
            const currentQty = toNum(row.quantity);
            if (currentQty < requestedQty) {
              missing.push({
                inventoryId: invId,
                name: row.name,
                requested: requestedQty,
                available: currentQty,
                deficit: requestedQty - currentQty
              });
            }
          }
        }
      }
      return {
        success: true,
        isAvailable: missing.length === 0,
        missing
      };
    } catch (error) {
      console.error('Error in operation:checkStockAvailability:', error);
      return { success: false, error: error.message };
    }
  });

  // ── 2. CRUD OPÉRATIONS ───────────────────────────────────────────────────
  ipcMain.handle('operation:create', async (event, data) => {
    try {
      await ensureOperationsTables();
      const ctx = getOperationContext();
      if (!data.patientId) return { success: false, error: 'Patient requis' };
      if (!data.operationType) return { success: false, error: 'Type d\'opération requis' };

      const id = uuidv4();
      const patientId = data.patientId;
      const operationDate = data.operationDate || moment().format('YYYY-MM-DD');
      const operationTime = data.operationTime || moment().format('HH:mm');
      const operationType = data.operationType.trim();
      const operationCode = toNull(data.operationCode);
      const category = data.category || 'orl';
      const practitionerId = toNull(data.practitionerId || ctx.userId);
      const practitionerName = toNull(data.practitionerName || ctx.userName);
      const room = toNull(data.room || 'Salle d\'intervention');
      const status = data.status || 'completed';
      const anesthesiaType = toNull(data.anesthesiaType || 'Locale');
      const durationMinutes = parseInt(data.durationMinutes, 10) || 30;
      const clinicalNotes = toNull(data.clinicalNotes);
      const postOpInstructions = toNull(data.postOpInstructions);
      const cost = toNum(data.cost);
      const equipmentUsed = Array.isArray(data.equipmentUsed) ? JSON.stringify(data.equipmentUsed) : toNull(data.equipmentUsed);
      const consumablesUsed = Array.isArray(data.consumablesUsed) ? JSON.stringify(data.consumablesUsed) : toNull(data.consumablesUsed);

      // Persistance automatique dans le catalogue BDD si l'acte saisi n'existe pas encore
      try {
        const existingType = await queryOne(
          `SELECT id FROM operation_types_catalog WHERE LOWER(name) = LOWER(?)`,
          [operationType]
        );
        if (!existingType) {
          const newTypeId = `op_custom_${Date.now()}`;
          await run(
            `INSERT INTO operation_types_catalog (id, specialty, name, code, category, defaultCost, defaultDuration, description, isActive, isCustom)
             VALUES (?, ?, ?, ?, 'Chirurgie', ?, ?, NULL, TRUE, TRUE)`,
            [newTypeId, category || 'orl', operationType, operationCode || null, cost || 0, durationMinutes || 30]
          );
        }
      } catch (catErr) {
        console.warn('Auto catalog persistence notice:', catErr);
      }

      // Décrémentation automatique des consommables du stock Inventaire
      if (Array.isArray(data.consumablesUsed) && data.consumablesUsed.length > 0) {
        for (const item of data.consumablesUsed) {
          const invId = item.inventoryId || item.id;
          const qty = toNum(item.quantity);
          if (invId && qty > 0) {
            try {
              await run(
                `UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?`,
                [qty, invId]
              );
              await run(
                `INSERT INTO inventory_movements (id, inventoryId, movementType, quantity, reason, movementDate, userId, createdAt)
                 VALUES (?, ?, 'out', ?, ?, ?, ?, ?)`,
                [
                  uuidv4(),
                  invId,
                  qty,
                  `Consommation opération: ${operationType} (Patient: ${patientId})`,
                  operationDate,
                  ctx.userId,
                  nowSql()
                ]
              );
            } catch (invErr) {
              console.warn('Inventory decrement warning for operation consumable:', invErr);
            }
          }
        }
      }

      // Enregistrement de l'utilisation d'équipement dans consultation_equipment_usage si applicable
      if (Array.isArray(data.equipmentUsed)) {
        for (const eq of data.equipmentUsed) {
          const eqId = typeof eq === 'string' ? eq : eq.id;
          if (eqId) {
            try {
              await run(
                `INSERT INTO consultation_equipment_usage (id, consultationId, equipmentId, createdAt)
                 VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
                [uuidv4(), id, eqId, nowSql()]
              );
            } catch (eqErr) {
              // Non bloquant
            }
          }
        }
      }

      let paidAmount = toNum(data.paidAmount);
      let paymentStatus = data.paymentStatus || 'unpaid';
      let paymentId = null;

      if (data.createPayment && cost > 0) {
        const payAmount = (data.paymentAmount !== undefined && data.paymentAmount !== null && data.paymentAmount !== '') 
          ? toNum(data.paymentAmount) 
          : cost;
        if (payAmount > 0) {
          paymentId = uuidv4();
          paidAmount = payAmount;
          paymentStatus = paidAmount >= cost ? 'paid' : 'partial';
          const pDate = data.paymentDate || moment().format('YYYY-MM-DD');
          const pMethod = data.paymentMethod || 'Espèces';
          const pDesc = `Règlement opération : ${operationType}${paidAmount < cost ? ' (Acompte)' : ' (Totalité)'}`;
          const pNotes = `Opération du ${operationDate} — Montant: ${cost} DZD | Payé: ${paidAmount} DZD | Reste: ${Math.max(0, cost - paidAmount)} DZD`;
          await run(
            `INSERT INTO payments (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes, practitionerId, practitionerName, createdAt, updatedAt)
             VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [paymentId, patientId, paidAmount, pDate, pMethod, pDesc, pNotes, practitionerId || null, practitionerName || null, nowSql(), nowSql()]
          );
        }
      } else if (paidAmount > 0) {
        paymentStatus = paidAmount >= cost ? 'paid' : 'partial';
      }

      await run(
        `INSERT INTO operations (
           id, patientId, operationDate, operationTime, operationType, operationCode, category,
           practitionerId, practitionerName, room, status, anesthesiaType, durationMinutes,
           clinicalNotes, postOpInstructions, equipmentUsed, consumablesUsed, cost, paidAmount,
           paymentId, paymentStatus, createdAt, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, patientId, operationDate, operationTime, operationType, operationCode, category,
          practitionerId, practitionerName, room, status, anesthesiaType, durationMinutes,
          clinicalNotes, postOpInstructions, equipmentUsed, consumablesUsed, cost, paidAmount,
          paymentId, paymentStatus, nowSql(), nowSql()
        ]
      );

      if (practitionerId && patientId) {
        try {
          await run(
            `INSERT INTO patient_practitioners (patientId, practitionerId, assignedByUserId)
             VALUES (?, ?, ?) ON CONFLICT (patientId, practitionerId) DO NOTHING`,
            [patientId, practitionerId, ctx.userId || practitionerId]
          );
        } catch (_) {}
      }

      return { success: true, data: { id, patientId, operationType, cost, paymentId, paymentStatus } };
    } catch (error) {
      console.error('Error in operation:create:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:getAll', async (event, filters = {}) => {
    try {
      await ensureOperationsTables();
      let sql = `
        SELECT o.*,
               p.firstName AS patientFirstName,
               p.lastName AS patientLastName,
               p.phone AS patientPhone,
               p.gender AS patientGender,
               p.dateOfBirth AS patientBirthDate
        FROM operations o
        LEFT JOIN patients p ON o.patientId = p.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.patientId) {
        sql += ` AND o.patientId = ?`;
        params.push(filters.patientId);
      }
      if (filters.category) {
        sql += ` AND o.category = ?`;
        params.push(filters.category);
      }
      if (filters.status) {
        sql += ` AND o.status = ?`;
        params.push(filters.status);
      }
      if (filters.operationType) {
        sql += ` AND o.operationType = ?`;
        params.push(filters.operationType);
      }
      if (filters.practitionerId) {
        sql += ` AND o.practitionerId = ?`;
        params.push(filters.practitionerId);
      }
      if (filters.startDate) {
        sql += ` AND o.operationDate >= ?`;
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        sql += ` AND o.operationDate <= ?`;
        params.push(filters.endDate);
      }
      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        sql += ` AND (LOWER(COALESCE(o.operationType, '')) LIKE ? OR LOWER(COALESCE(o.operationCode, '')) LIKE ? OR LOWER(COALESCE(p.firstName, '')) LIKE ? OR LOWER(COALESCE(p.lastName, '')) LIKE ? OR LOWER(COALESCE(o.practitionerName, '')) LIKE ?)`;
        params.push(term, term, term, term, term);
      }

      sql += ` ORDER BY o.operationDate DESC, o.operationTime DESC, o.createdAt DESC`;

      const rows = await query(sql, params);
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error in operation:getAll:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:getByPatient', async (event, patientId) => {
    try {
      await ensureOperationsTables();
      if (!patientId) return { success: true, data: [] };
      const rows = await query(
        `SELECT o.*, p.firstName AS patientFirstName, p.lastName AS patientLastName
         FROM operations o
         LEFT JOIN patients p ON o.patientId = p.id
         WHERE o.patientId = ?
         ORDER BY o.operationDate DESC, o.createdAt DESC`,
        [patientId]
      );
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error in operation:getByPatient:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:getById', async (event, id) => {
    try {
      await ensureOperationsTables();
      if (!id) return { success: false, error: 'ID requis' };
      let row = await queryOne(
        `SELECT o.*,
                p.firstName AS patientFirstName,
                p.lastName AS patientLastName,
                p.phone AS patientPhone,
                p.gender AS patientGender,
                p.dateOfBirth AS patientBirthDate,
                pay.amount AS paidAmount,
                pay.paymentMethod AS paidMethod
         FROM operations o
         LEFT JOIN patients p ON o.patientId = p.id
         LEFT JOIN payments pay ON o.paymentId = pay.id
         WHERE o.id = ?`,
        [id]
      );
      if (!row) {
        row = await queryOne(
          `SELECT o.*,
                  p.firstName AS patientFirstName,
                  p.lastName AS patientLastName,
                  p.phone AS patientPhone,
                  p.gender AS patientGender,
                  p.dateOfBirth AS patientBirthDate
           FROM operations o
           LEFT JOIN patients p ON o.patientId = p.id
           WHERE o.id = ?`,
          [id]
        );
      }
      if (!row) return { success: false, error: 'Opération introuvable' };
      return { success: true, data: row };
    } catch (error) {
      console.error('Error in operation:getById:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:update', async (event, id, data) => {
    try {
      await ensureOperationsTables();
      const existing = await queryOne(`SELECT * FROM operations WHERE id = ?`, [id]);
      if (!existing) return { success: false, error: 'Opération introuvable' };

      const operationDate = data.operationDate || existing.operationDate;
      const operationTime = data.operationTime || existing.operationTime;
      const operationType = data.operationType ? data.operationType.trim() : existing.operationType;
      const operationCode = data.operationCode !== undefined ? toNull(data.operationCode) : existing.operationCode;
      const category = data.category || existing.category;
      const practitionerId = data.practitionerId !== undefined ? toNull(data.practitionerId) : existing.practitionerId;
      const practitionerName = data.practitionerName !== undefined ? toNull(data.practitionerName) : existing.practitionerName;
      const room = data.room !== undefined ? toNull(data.room) : existing.room;
      const status = data.status || existing.status;
      const anesthesiaType = data.anesthesiaType !== undefined ? toNull(data.anesthesiaType) : existing.anesthesiaType;
      const durationMinutes = data.durationMinutes !== undefined ? (parseInt(data.durationMinutes, 10) || 30) : existing.durationMinutes;
      const clinicalNotes = data.clinicalNotes !== undefined ? toNull(data.clinicalNotes) : existing.clinicalNotes;
      const postOpInstructions = data.postOpInstructions !== undefined ? toNull(data.postOpInstructions) : existing.postOpInstructions;
      const cost = data.cost !== undefined ? toNum(data.cost) : existing.cost;
      let paidAmount = data.paidAmount !== undefined ? toNum(data.paidAmount) : (Number(existing.paidAmount) || 0);
      let paymentStatus = data.paymentStatus || existing.paymentStatus;
      if (paymentStatus === 'paid' && cost > 0 && paidAmount < cost) {
        paidAmount = cost;
      } else if (cost > 0 && paidAmount >= cost) {
        paymentStatus = 'paid';
      }
      const equipmentUsed = Array.isArray(data.equipmentUsed) ? JSON.stringify(data.equipmentUsed) : (data.equipmentUsed !== undefined ? toNull(data.equipmentUsed) : existing.equipmentUsed);
      const consumablesUsed = Array.isArray(data.consumablesUsed) ? JSON.stringify(data.consumablesUsed) : (data.consumablesUsed !== undefined ? toNull(data.consumablesUsed) : existing.consumablesUsed);

      await run(
        `UPDATE operations
         SET operationDate = ?, operationTime = ?, operationType = ?, operationCode = ?, category = ?,
             practitionerId = ?, practitionerName = ?, room = ?, status = ?, anesthesiaType = ?,
             durationMinutes = ?, clinicalNotes = ?, postOpInstructions = ?, equipmentUsed = ?,
             consumablesUsed = ?, cost = ?, paidAmount = ?, paymentStatus = ?, updatedAt = ?
         WHERE id = ?`,
        [
          operationDate, operationTime, operationType, operationCode, category,
          practitionerId, practitionerName, room, status, anesthesiaType,
          durationMinutes, clinicalNotes, postOpInstructions, equipmentUsed,
          consumablesUsed, cost, paidAmount, paymentStatus, nowSql(), id
        ]
      );

      return { success: true, data: { id, operationType, cost, status, paidAmount, paymentStatus } };
    } catch (error) {
      console.error('Error in operation:update:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:delete', async (event, id) => {
    try {
      const ctx = getOperationContext();
      if (!ctx.canManage) return { success: false, error: 'Accès non autorisé' };
      await run(`DELETE FROM operations WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error('Error in operation:delete:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('operation:recordPayment', async (event, data) => {
    try {
      await ensureOperationsTables();
      const { operationId, amount, paymentMethod, paymentDate, notes } = data || {};
      if (!operationId) return { success: false, error: 'operationId requis' };
      const op = await queryOne(`SELECT * FROM operations WHERE id = ?`, [operationId]);
      if (!op) return { success: false, error: 'Opération introuvable' };

      const cost = Number(op.cost) || 0;
      const alreadyPaid = Number(op.paidAmount) || 0;
      const remaining = Math.max(0, cost - alreadyPaid);
      if ((cost > 0 && alreadyPaid >= cost) || op.paymentStatus === 'paid') {
        return { success: false, error: 'Opération déjà réglée en totalité — aucun paiement supplémentaire possible' };
      }
      const payAmount = Number(amount) > 0 ? Math.min(Number(amount), remaining) : remaining;
      if (payAmount <= 0) return { success: false, error: 'Montant invalide' };

      const paymentId = uuidv4();
      const pDate = paymentDate || moment().format('YYYY-MM-DD');
      const pMethod = paymentMethod || 'Espèces';
      const newPaidAmount = alreadyPaid + payAmount;
      const paymentStatus = newPaidAmount >= cost ? 'paid' : 'partial';

      const description = `Versement opération : ${op.operationType}${paymentStatus === 'paid' ? ' (Solde complet)' : ' (Acompte)'}`;
      const pNotes = notes || `Opération du ${op.operationDate || pDate} — Montant: ${cost} DZD | Déjà payé: ${alreadyPaid} DZD | Ce versement: ${payAmount} DZD | Reste: ${Math.max(0, cost - newPaidAmount)} DZD`;

      await run(
        `INSERT INTO payments (id, patientId, consultationId, amount, paymentDate, paymentMethod, description, notes, practitionerId, practitionerName, createdAt, updatedAt)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, op.patientId, payAmount, pDate, pMethod, description, pNotes, op.practitionerId || null, op.practitionerName || null, nowSql(), nowSql()]
      );

      await run(
        `UPDATE operations SET paymentId = ?, paidAmount = ?, paymentStatus = ?, updatedAt = ? WHERE id = ?`,
        [paymentId, newPaidAmount, paymentStatus, nowSql(), operationId]
      );

      return { success: true, data: { operationId, paymentId, paidAmount: newPaidAmount, paymentStatus } };
    } catch (error) {
      console.error('Error in operation:recordPayment:', error);
      return { success: false, error: error.message };
    }
  });

  // ── 3. STATISTIQUES DES OPÉRATIONS ───────────────────────────────────────
  ipcMain.handle('operation:getStats', async (event, filters = {}) => {
    try {
      let whereSql = `WHERE 1=1`;
      const params = [];
      if (filters.category) {
        whereSql += ` AND category = ?`;
        params.push(filters.category);
      }
      if (filters.startDate) {
        whereSql += ` AND operationDate >= ?`;
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereSql += ` AND operationDate <= ?`;
        params.push(filters.endDate);
      }

      const totalRow = await queryOne(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN cost ELSE 0 END), 0) AS totalCost FROM operations ${whereSql}`, params);
      const completedRow = await queryOne(`SELECT COUNT(*) AS completed FROM operations ${whereSql} AND status = 'completed'`, params);
      const scheduledRow = await queryOne(`SELECT COUNT(*) AS scheduled FROM operations ${whereSql} AND status = 'scheduled'`, params);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const startOfMonth = `${currentMonth}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const endOfMonth = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
      const thisMonthRow = await queryOne(`SELECT COUNT(*) AS thisMonth, COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN cost ELSE 0 END), 0) AS thisMonthCost FROM operations ${whereSql} AND operationDate >= ? AND operationDate <= ?`, [...params, startOfMonth, endOfMonth]);

      const topTypes = await query(
        `SELECT operationType, COUNT(*) AS count, COALESCE(SUM(CASE WHEN paymentStatus = 'paid' THEN cost ELSE 0 END), 0) AS totalAmount
         FROM operations ${whereSql}
         GROUP BY operationType
         ORDER BY count DESC
         LIMIT 5`,
        params
      );

      return {
        success: true,
        data: {
          total: totalRow?.total || 0,
          totalRevenue: totalRow?.totalCost || 0,
          completed: completedRow?.completed || 0,
          scheduled: scheduledRow?.scheduled || 0,
          thisMonthCount: thisMonthRow?.thisMonth || 0,
          thisMonthRevenue: thisMonthRow?.thisMonthCost || 0,
          topTypes: topTypes || []
        }
      };
    } catch (error) {
      console.error('Error in operation:getStats:', error);
      return { success: false, error: error.message };
    }
  });
}
