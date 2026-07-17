/**
 * Gestionnaire IPC — Module Équipement (Sous-plan G)
 * Suivi des équipements du cabinet, maintenance, historique d'usage.
 */

import { ipcMain } from 'electron';
import { query, queryOne, run } from '../database-unified.js';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';

const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
const nowSql = () => moment().format('YYYY-MM-DD HH:mm:ss');

const EQUIPMENT_CATEGORIES = {
  dental_chair:      { label: 'Fauteuil dentaire',       specificFields: [] },
  sterilization:     { label: 'Stérilisation (Autoclave)', specificFields: ['cycleHistory', 'errorLog', 'validationCertificates'] },
  imaging:           { label: 'Imagerie (Radiologie)',     specificFields: ['calibrationDates', 'linkedPatientImages'] },
  intraoral_camera:  { label: 'Caméra intra-orale',        specificFields: ['connectionType'] },
  compressor:        { label: 'Compresseur',               specificFields: ['pressure', 'operatingHours', 'lastOilChange'] },
  aspiration:        { label: "Système d'aspiration",      specificFields: ['type', 'filterReplacement'] },
  curing_lamp:       { label: 'Lampe à photopolymériser',  specificFields: ['batteryStatus', 'lastIntensityTest'] },
  endo_motor:        { label: "Moteur d'endodontie",       specificFields: ['usageHours'] },
  apex_locator:      { label: "Localisateur d'apex",       specificFields: ['calibration'] },
  ultrasonic:        { label: 'Détartreur ultrasonique',   specificFields: ['tips'] },
  air_polisher:      { label: 'Aéropolisseur',             specificFields: ['powderStock'] },
  surgical_motor:    { label: 'Moteur chirurgical',        specificFields: ['sterilizationHistory', 'accessories'] },
  cad_cam:           { label: 'CAD/CAM',                   specificFields: ['softwareVersion', 'calibration'] },
  it_equipment:      { label: 'Informatique / IT',         specificFields: [] },
  general:           { label: 'Équipement général',        specificFields: [] }
};

const EQUIPMENT_STATUS_LABELS = {
  available: 'Disponible',
  in_use: 'En cours d\'utilisation',
  maintenance: 'En maintenance',
  out_of_service: 'Hors service'
};

function getEquipmentContext() {
  const role = String(global.currentUser?.role || '').trim();
  return {
    userId: global.currentUser?.id || null,
    role,
    isSuperAdmin: !!global.currentUser?.isSuperAdmin,
    isDoctorAdmin: !!global.currentUser?.isAdmin && !global.currentUser?.isSuperAdmin,
    isPractitioner: role === 'doctor' || role === 'dentist',
    isAssistant: role === 'assistant',
    canManage: !!global.currentUser?.isSuperAdmin || !!global.currentUser?.isAdmin || role === 'doctor' || role === 'dentist',
    canSeeCosts: !!global.currentUser?.isSuperAdmin || !!global.currentUser?.isAdmin || role === 'doctor' || role === 'dentist'
  };
}

export function handleEquipmentEvents() {
  // ── CATEGORIES ─────────────────────────────────────────────────────────────
  ipcMain.handle('equipment:getCategories', async () => {
    const list = Object.entries(EQUIPMENT_CATEGORIES).map(([key, val]) => ({
      value: key,
      label: val.label,
      specificFields: val.specificFields
    }));
    return { success: true, data: list };
  });

  // ── CRUD ÉQUIPEMENT ───────────────────────────────────────────────────────
  ipcMain.handle('equipment:create', async (event, data) => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.canManage) return { success: false, error: 'Accès refusé' };
      const id = uuidv4();
      const specificFields = data.specificFields || {};
      await run(
        `INSERT INTO equipment
         (id, name, category, brand, model, serialNumber, purchaseDate, warrantyEnd, assignedRoom, assignedDoctorId,
          status, lastMaintenanceDate, nextMaintenanceDate, notes, specificFields, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.name, data.category, toNull(data.brand), toNull(data.model),
          toNull(data.serialNumber), toNull(data.purchaseDate), toNull(data.warrantyEnd),
          toNull(data.assignedRoom), toNull(data.assignedDoctorId),
          data.status || 'available', toNull(data.lastMaintenanceDate), toNull(data.nextMaintenanceDate),
          toNull(data.notes), JSON.stringify(specificFields), nowSql(), nowSql()]
      );
      return { success: true, id };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:getAll', async (event, filters = {}) => {
    try {
      let sql = `SELECT e.*, u.fullName as doctorName FROM equipment e LEFT JOIN users u ON u.id = e.assignedDoctorId WHERE e.isActive = 1`;
      const params = [];
      if (filters.category) { sql += ' AND e.category = ?'; params.push(filters.category); }
      if (filters.status) { sql += ' AND e.status = ?'; params.push(filters.status); }
      if (filters.room) { sql += ' AND e.assignedRoom = ?'; params.push(filters.room); }
      if (filters.search) {
        sql += ' AND (e.name LIKE ? OR e.brand LIKE ? OR e.model LIKE ? OR e.serialNumber LIKE ?)';
        const p = `%${filters.search}%`;
        params.push(p, p, p, p);
      }
      sql += ' ORDER BY e.name';
      const items = await query(sql, params);
      return { success: true, data: (items || []).map(e => ({
        ...e,
        specificFields: safelyParseJson(e.specificFields)
      })) };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:getById', async (event, id) => {
    try {
      const eq = await queryOne(
        `SELECT e.*, u.fullName as doctorName FROM equipment e LEFT JOIN users u ON u.id = e.assignedDoctorId WHERE e.id = ?`,
        [id]
      );
      if (!eq) return { success: false, error: 'Équipement introuvable' };
      const maintenance = await query(
        `SELECT m.*, s.name as supplierName FROM equipment_maintenance m LEFT JOIN suppliers s ON s.id = m.supplierId WHERE m.equipmentId = ? ORDER BY m.maintenanceDate DESC`,
        [id]
      );
      const planUsage = await query(
        `SELECT peu.*, tp.title as planTitle, p.firstName, p.lastName
         FROM plan_equipment_usage peu
         LEFT JOIN treatment_plans tp ON tp.id = peu.planId
         LEFT JOIN patients p ON p.id = tp.patientId
         WHERE peu.equipmentId = ?
         ORDER BY peu.createdAt DESC`,
        [id]
      ).catch(() => []);
      return {
        success: true,
        data: {
          ...eq,
          specificFields: safelyParseJson(eq.specificFields),
          maintenance: maintenance || [],
          planUsage: planUsage || []
        }
      };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:update', async (event, id, data) => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.canManage) return { success: false, error: 'Accès refusé' };
      const specificFields = data.specificFields || {};
      await run(
        `UPDATE equipment SET
          name=?, category=?, brand=?, model=?, serialNumber=?, purchaseDate=?, warrantyEnd=?,
          assignedRoom=?, assignedDoctorId=?, status=?, lastMaintenanceDate=?, nextMaintenanceDate=?,
          notes=?, specificFields=?, updatedAt=?
         WHERE id=?`,
        [data.name, data.category, toNull(data.brand), toNull(data.model),
          toNull(data.serialNumber), toNull(data.purchaseDate), toNull(data.warrantyEnd),
          toNull(data.assignedRoom), toNull(data.assignedDoctorId),
          data.status || 'available', toNull(data.lastMaintenanceDate), toNull(data.nextMaintenanceDate),
          toNull(data.notes), JSON.stringify(specificFields), nowSql(), id]
      );
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:delete', async (event, id) => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.canManage) return { success: false, error: 'Accès refusé' };
      await run(`UPDATE equipment SET isActive=0, updatedAt=? WHERE id=?`, [nowSql(), id]);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── MAINTENANCE ────────────────────────────────────────────────────────────
  ipcMain.handle('equipment:addMaintenance', async (event, data) => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.canManage) return { success: false, error: 'Accès refusé' };
      const id = uuidv4();
      await run(
        `INSERT INTO equipment_maintenance (id, equipmentId, maintenanceDate, maintenanceType, cost, technician, supplierId, notes, performedBy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.equipmentId, data.maintenanceDate, data.maintenanceType,
          toNum(data.cost) || 0, toNull(data.technician), toNull(data.supplierId),
          toNull(data.notes), ctx.userId, nowSql()]
      );
      await run(
        `UPDATE equipment SET lastMaintenanceDate=?, nextMaintenanceDate=?, updatedAt=? WHERE id=?`,
        [data.maintenanceDate, toNull(data.nextMaintenanceDate), nowSql(), data.equipmentId]
      );
      return { success: true, id };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── ALERTES ────────────────────────────────────────────────────────────────
  ipcMain.handle('equipment:getAlerts', async (event, days = 15) => {
    try {
      const future = moment().add(days, 'days').format('YYYY-MM-DD');
      const today = moment().format('YYYY-MM-DD');
      const upcoming = await query(
        `SELECT * FROM equipment WHERE isActive=1 AND status != 'out_of_service'
         AND nextMaintenanceDate IS NOT NULL AND nextMaintenanceDate <= ?
         AND nextMaintenanceDate >= ?
         ORDER BY nextMaintenanceDate`,
        [future, today]
      );
      const overdue = await query(
        `SELECT * FROM equipment WHERE isActive=1 AND status != 'out_of_service'
         AND nextMaintenanceDate IS NOT NULL AND nextMaintenanceDate < ?
         ORDER BY nextMaintenanceDate`,
        [today]
      );
      const inMaintenance = await query(
        `SELECT * FROM equipment WHERE isActive=1 AND status IN ('maintenance', 'out_of_service')
         ORDER BY name`
      );
      return {
        success: true,
        data: { upcoming: upcoming || [], overdue: overdue || [], inMaintenance: inMaintenance || [] }
      };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:requestMaintenance', async (event, id, reason = '') => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.isPractitioner && !ctx.isAssistant) return { success: false, error: 'Accès refusé' };
      await run(
        `UPDATE equipment SET status='maintenance', notes=COALESCE(notes,'') || ?, updatedAt=? WHERE id=?`,
        [`\nDemande maintenance: ${reason}`, nowSql(), id]
      );
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── LIEN PLAN (G5) ────────────────────────────────────────────────────────
  ipcMain.handle('equipment:linkToPlan', async (event, data) => {
    try {
      const id = uuidv4();
      await run(
        `INSERT INTO plan_equipment_usage (id, planId, inventoryId, equipmentId, usageDate, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.planId, data.inventoryId || null, data.equipmentId || null, nowSql(), toNull(data.notes), nowSql()]
      );
      return { success: true, id };
    } catch (e) { return { success: false, error: e.message }; }
  });

  console.log('Equipment events registered');
}

function safelyParseJson(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch (_) { return {}; }
}
