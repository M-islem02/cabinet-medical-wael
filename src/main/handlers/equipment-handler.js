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
    if (getEquipmentContext().isAssistant) return { success: false, error: 'Accès refusé' };
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
      if (getEquipmentContext().isAssistant) return { success: false, error: 'Accès refusé' };
      await ensureDentalEquipment();
      let sql = `SELECT e.*, u.fullName as doctorName FROM equipment e LEFT JOIN users u ON u.id = e.assignedDoctorId WHERE e.isActive = TRUE`;
      const params = [];
      if (filters.category) { sql += ' AND e.category = ?'; params.push(filters.category); }
      if (filters.status) { sql += ' AND e.status = ?'; params.push(filters.status); }
      if (filters.room) { sql += ' AND e.assignedRoom = ?'; params.push(filters.room); }
      if (filters.search) {
        sql += ' AND (e.name ILIKE ? OR e.brand ILIKE ? OR e.model ILIKE ? OR e.serialNumber ILIKE ?)';
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
      if (getEquipmentContext().isAssistant) return { success: false, error: 'Accès refusé' };
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
      await run(`UPDATE equipment SET isActive=FALSE, updatedAt=? WHERE id=?`, [nowSql(), id]);
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
        `UPDATE equipment SET lastMaintenanceDate=?, nextMaintenanceDate=?, status='available', updatedAt=? WHERE id=?`,
        [data.maintenanceDate, toNull(data.nextMaintenanceDate), nowSql(), data.equipmentId]
      );
      return { success: true, id };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── ALERTES ────────────────────────────────────────────────────────────────
  ipcMain.handle('equipment:getAlerts', async (event, days = 15) => {
    try {
      if (getEquipmentContext().isAssistant) return { success: false, error: 'Accès refusé' };
      const future = moment().add(days, 'days').format('YYYY-MM-DD');
      const today = moment().format('YYYY-MM-DD');
      const upcoming = await query(
        `SELECT * FROM equipment WHERE isActive=TRUE AND status != 'out_of_service'
         AND nextMaintenanceDate IS NOT NULL AND nextMaintenanceDate <= ?
         AND nextMaintenanceDate >= ?
         ORDER BY nextMaintenanceDate`,
        [future, today]
      );
      const overdue = await query(
        `SELECT * FROM equipment WHERE isActive=TRUE AND status != 'out_of_service'
         AND nextMaintenanceDate IS NOT NULL AND nextMaintenanceDate < ?
         ORDER BY nextMaintenanceDate`,
        [today]
      );
      const inMaintenance = await query(
        `SELECT * FROM equipment WHERE isActive=TRUE AND status IN ('maintenance', 'out_of_service')
         ORDER BY name`
      );
      const unscheduled = await query(
        `SELECT * FROM equipment WHERE isActive=TRUE
         AND nextMaintenanceDate IS NULL AND status NOT IN ('maintenance', 'out_of_service')
         ORDER BY name`
      );
      return {
        success: true,
        data: {
          upcoming: upcoming || [], overdue: overdue || [],
          inMaintenance: inMaintenance || [], unscheduled: unscheduled || []
        }
      };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:requestMaintenance', async (event, id, reason = '') => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.isPractitioner) return { success: false, error: 'Accès refusé' };
      await run(
        `UPDATE equipment SET status='maintenance', notes=COALESCE(notes,'') || ?, updatedAt=? WHERE id=?`,
        [`\nDemande maintenance: ${reason}`, nowSql(), id]
      );
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:clearMaintenanceRequest', async (event, id) => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.isPractitioner && !ctx.canManage) return { success: false, error: 'Accès refusé' };
      await run(
        `UPDATE equipment SET status='available', notes=COALESCE(notes,'') || ?, updatedAt=?
         WHERE id=? AND isActive=TRUE`,
        [`\nSignalement clôturé le ${moment().format('DD/MM/YYYY HH:mm')}`, nowSql(), id]
      );
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // ── LIEN PLAN (G5) ────────────────────────────────────────────────────────
  ipcMain.handle('equipment:linkToPlan', async (event, data) => {
    try {
      if (getEquipmentContext().isAssistant) return { success: false, error: 'Accès refusé' };
      if (!data.inventoryId && !data.equipmentId) {
        return { success: false, error: 'Un article ou un équipement doit être sélectionné' };
      }
      const id = uuidv4();
      await run(
        `INSERT INTO plan_equipment_usage (id, planId, inventoryId, equipmentId, usageDate, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.planId, data.inventoryId || null, data.equipmentId || null, nowSql(), toNull(data.notes), nowSql()]
      );
      return { success: true, id };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:getForConsultation', async (event, consultationId) => {
    try {
      if (getEquipmentContext().isAssistant) return { success: false, error: 'Accès refusé' };
      const rows = await query(
        `SELECT ceu.*, e.name, e.category, e.status
         FROM consultation_equipment_usage ceu
         JOIN equipment e ON e.id = ceu.equipmentId
         WHERE ceu.consultationId = ? ORDER BY e.name`,
        [consultationId]
      );
      return { success: true, data: rows || [] };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('equipment:syncConsultation', async (event, consultationId, equipmentIds = []) => {
    try {
      const ctx = getEquipmentContext();
      if (!ctx.isPractitioner && !ctx.canManage) return { success: false, error: 'Accès refusé' };
      const ids = [...new Set((Array.isArray(equipmentIds) ? equipmentIds : []).filter(Boolean))];
      await run('DELETE FROM consultation_equipment_usage WHERE consultationId = ?', [consultationId]);
      for (const equipmentId of ids) {
        await run(
          `INSERT INTO consultation_equipment_usage (id, consultationId, equipmentId, createdAt)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), consultationId, equipmentId, nowSql()]
        );
      }
      return { success: true, count: ids.length };
    } catch (e) { return { success: false, error: e.message }; }
  });

  console.log('Equipment events registered');
}

function safelyParseJson(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try { return JSON.parse(value); } catch (_) { return {}; }
}

const DENTAL_EQUIPMENT_SEEDS = [
  {
    id: 'eq-dent-001',
    name: 'Fauteuil Dentaire Ergonomique Pro',
    category: 'dental_chair',
    brand: 'Castellini',
    model: 'Skema 6',
    serialNumber: 'CS-2024-9841',
    purchaseDate: '2024-01-15',
    warrantyEnd: '2027-01-15',
    assignedRoom: 'Cabinet 1 (Soins Dentaires)',
    status: 'available',
    lastMaintenanceDate: '2026-06-10',
    nextMaintenanceDate: '2026-12-10',
    notes: 'Fauteuil principal avec unit praticien 5 cordons et scialytique LED.'
  },
  {
    id: 'eq-dent-002',
    name: 'Autoclave Stérilisateur Classe B 24L',
    category: 'sterilization',
    brand: 'Euronda',
    model: 'E10 24L',
    serialNumber: 'EU-2023-4512',
    purchaseDate: '2023-11-20',
    warrantyEnd: '2026-11-20',
    assignedRoom: 'Salle de Stérilisation',
    status: 'available',
    lastMaintenanceDate: '2026-07-01',
    nextMaintenanceDate: '2027-01-01',
    notes: 'Stérilisation conforme EN 13060 avec traçabilité et imprimante thermique intégrée.'
  },
  {
    id: 'eq-dent-003',
    name: 'Détartreur Ultrasonique Piézoélectrique',
    category: 'ultrasonic',
    brand: 'EMS Dental',
    model: 'Piezon Master 700',
    serialNumber: 'PM-2024-1102',
    purchaseDate: '2024-02-10',
    warrantyEnd: '2026-02-10',
    assignedRoom: 'Cabinet 1 (Soins Dentaires)',
    status: 'available',
    lastMaintenanceDate: '2026-05-15',
    nextMaintenanceDate: '2026-11-15',
    notes: 'Pièce à main avec lumière LED et réserve de fluide indépendant.'
  },
  {
    id: 'eq-dent-004',
    name: 'Capteur Radiologique Intra-oral Numérique HD',
    category: 'imaging',
    brand: 'Carestream Dental',
    model: 'RVG 6200 Taille 2',
    serialNumber: 'CS-RVG-2024-88',
    purchaseDate: '2024-03-01',
    warrantyEnd: '2027-03-01',
    assignedRoom: 'Cabinet 1 (Radiologie Dentaire)',
    status: 'available',
    lastMaintenanceDate: '2026-06-01',
    nextMaintenanceDate: '2027-03-01',
    notes: 'Capteur radiographique haute définition CMOS avec fibre optique.'
  },
  {
    id: 'eq-dent-005',
    name: "Moteur d'Endodontie avec Localisateur d'Apex",
    category: 'endo_motor',
    brand: 'Dentsply Sirona',
    model: 'X-Smart Plus & Propex II',
    serialNumber: 'DS-END-2024-019',
    purchaseDate: '2024-04-12',
    warrantyEnd: '2026-04-12',
    assignedRoom: 'Cabinet 1 (Soins Dentaires)',
    status: 'available',
    lastMaintenanceDate: '2026-04-12',
    nextMaintenanceDate: '2026-10-12',
    notes: 'Moteur sans fil à rotation continue et mouvement réciproque WaveOne Gold.'
  },
  {
    id: 'eq-dent-006',
    name: 'Lampe à Photopolymériser LED Haute Puissance',
    category: 'curing_lamp',
    brand: 'Ivoclar Vivadent',
    model: 'Bluephase PowerCure',
    serialNumber: 'IV-BP-2024-301',
    purchaseDate: '2024-05-05',
    warrantyEnd: '2026-05-05',
    assignedRoom: 'Cabinet 1 (Soins Dentaires)',
    status: 'available',
    lastMaintenanceDate: '2026-05-05',
    nextMaintenanceDate: '2026-11-05',
    notes: 'Intensité 3000 mW/cm² avec polywave pour tous photoinitiateurs.'
  },
  {
    id: 'eq-dent-007',
    name: 'Compresseur Dentaire Silencieux Sans Huile 50L',
    category: 'compressor',
    brand: 'Cattani',
    model: 'AC 200 avec Dessiccateur',
    serialNumber: 'CAT-2023-8821',
    purchaseDate: '2023-10-01',
    warrantyEnd: '2026-10-01',
    assignedRoom: 'Local Technique',
    status: 'available',
    lastMaintenanceDate: '2026-06-20',
    nextMaintenanceDate: '2026-12-20',
    notes: 'Air médical sec et déshuilé conforme normes ISO pour 2 postes de travail.'
  },
  {
    id: 'eq-dent-008',
    name: 'Aéropolisseur Prophylactique Sub/Supragingival',
    category: 'air_polisher',
    brand: 'EMS Dental',
    model: 'AIRFLOW One',
    serialNumber: 'AF-2024-7740',
    purchaseDate: '2024-06-01',
    warrantyEnd: '2026-06-01',
    assignedRoom: 'Cabinet 1 (Soins Dentaires)',
    status: 'available',
    lastMaintenanceDate: '2026-06-01',
    nextMaintenanceDate: '2026-12-01',
    notes: 'Élimination du biofilm et des colorations avec poudre érythritol PLUS.'
  },
  {
    id: 'eq-dent-009',
    name: "Moteur Chirurgical et d'Implantologie Dentaire",
    category: 'surgical_motor',
    brand: 'Bien-Air',
    model: 'Chiropro Plus 3rd Gen',
    serialNumber: 'BA-CH-2024-602',
    purchaseDate: '2024-01-20',
    warrantyEnd: '2026-01-20',
    assignedRoom: 'Salle de Chirurgie Dentaire',
    status: 'available',
    lastMaintenanceDate: '2026-07-15',
    nextMaintenanceDate: '2027-01-15',
    notes: 'Couple 80 Ncm avec pompe péristaltique et contre-angle bague verte 20:1 L Micro-Series.'
  },
  {
    id: 'eq-dent-010',
    name: 'Caméra Intra-orale HD avec Écran Tactile',
    category: 'intraoral_camera',
    brand: 'Acteon',
    model: 'SoproCARE HD',
    serialNumber: 'AC-SOP-2024-91',
    purchaseDate: '2024-02-18',
    warrantyEnd: '2026-02-18',
    assignedRoom: 'Cabinet 1 (Soins Dentaires)',
    status: 'available',
    lastMaintenanceDate: '2026-05-10',
    nextMaintenanceDate: '2026-11-10',
    notes: 'Aide au diagnostic des caries et évaluation de la plaque dentaire.'
  }
];

let dentalEquipmentSeeded = false;

export async function ensureDentalEquipment() {
  if (dentalEquipmentSeeded) return;
  try {
    for (const eq of DENTAL_EQUIPMENT_SEEDS) {
      const existing = await queryOne('SELECT id FROM equipment WHERE id = ?', [eq.id]);
      if (!existing) {
        await run(
          `INSERT INTO equipment (
            id, name, category, brand, model, serialNumber, purchaseDate, warrantyEnd,
            assignedRoom, status, lastMaintenanceDate, nextMaintenanceDate, notes, isActive, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
          [
            eq.id, eq.name, eq.category, eq.brand, eq.model, eq.serialNumber, eq.purchaseDate, eq.warrantyEnd,
            eq.assignedRoom, eq.status, eq.lastMaintenanceDate, eq.nextMaintenanceDate, eq.notes,
            nowSql(), nowSql()
          ]
        );
      }
    }
    dentalEquipmentSeeded = true;
    console.log('[Equipment] 10 Dental equipments seeded successfully');
  } catch (err) {
    console.error('[Equipment] Auto-seeding dental equipment error:', err);
  }
}
